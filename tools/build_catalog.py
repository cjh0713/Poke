"""整理 PokéAPI 公开 CSV 与图片。仅开发时运行，页面不依赖 Python 或外网。"""
import csv
import hashlib
import io
import json
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'tools' / '.cache'
ART = ROOT / 'assets' / 'pokemon'
DATA = ROOT / 'assets' / 'data'
for directory in (CACHE, ART, DATA, ROOT / 'js' / 'data'):
    directory.mkdir(parents=True, exist_ok=True)


def fetch(url):
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, headers={'User-Agent': 'PokeDiscoveryRoom-CourseData/1.0'})
            with urllib.request.urlopen(request, timeout=45) as response:
                return response.read()
        except Exception:
            if attempt == 2:
                raise
            time.sleep(attempt + 1)


def revision(repo):
    try:
        result = json.loads(fetch(f'https://api.github.com/repos/{repo}/commits/master'))
        return result['sha']
    except Exception as error:
        # GitHub API 的匿名配额可能耗尽。分支快照仍保留逐文件 SHA-256。
        print(f'Commit lookup unavailable for {repo}: {error}; using master + file hashes.', flush=True)
        return 'master'


def main():
    source_revision = revision('PokeAPI/pokeapi')
    sprite_revision = revision('PokeAPI/sprites')
    tables = {}
    source_files = []
    for filename in ('pokemon.csv', 'pokemon_species.csv', 'pokemon_species_names.csv', 'languages.csv',
                     'types.csv', 'type_names.csv', 'pokemon_types.csv', 'pokemon_stats.csv',
                     'stats.csv', 'type_efficacy.csv'):
        url = f'https://raw.githubusercontent.com/PokeAPI/pokeapi/{source_revision}/data/v2/csv/{filename}'
        cached = CACHE / f'{source_revision}-{filename}'
        raw = cached.read_bytes() if cached.exists() else fetch(url)
        cached.write_bytes(raw)
        tables[filename] = list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig'))))
        source_files.append({'file': filename, 'url': url, 'sha256': hashlib.sha256(raw).hexdigest()})
        print(f'Read {filename}', flush=True)

    language = next(row['id'] for row in tables['languages.csv'] if row['identifier'].lower() == 'zh-hans')
    names = {int(row['pokemon_species_id']): row for row in tables['pokemon_species_names.csv']
             if row['local_language_id'] == language}
    type_names = {int(row['type_id']): row['name'] for row in tables['type_names.csv']
                  if row['local_language_id'] == language}
    type_ids = {int(row['id']): row['identifier'] for row in tables['types.csv'] if int(row['id']) <= 18}
    stat_ids = {int(row['id']): row['identifier'] for row in tables['stats.csv'] if int(row['id']) <= 6}
    species = {int(row['id']): row for row in tables['pokemon_species.csv']}
    types = []
    for type_id, key in type_ids.items():
        damage = {type_ids[int(row['target_type_id'])]: int(row['damage_factor']) / 100
                  for row in tables['type_efficacy.csv']
                  if int(row['damage_type_id']) == type_id and int(row['target_type_id']) <= 18}
        assert len(damage) == 18, f'Incomplete relation: {key}'
        types.append({'id': key, 'name': type_names[type_id], 'damage': damage})

    pokemon = []
    for row in tables['pokemon.csv']:
        number = int(row['id'])
        if not (1 <= number <= 151 and row['is_default'] == '1'):
            continue
        stats = {stat_ids[int(item['stat_id'])]: int(item['base_stat'])
                 for item in tables['pokemon_stats.csv']
                 if int(item['pokemon_id']) == number and int(item['stat_id']) <= 6}
        member_types = sorted((item for item in tables['pokemon_types.csv']
                               if int(item['pokemon_id']) == number), key=lambda item: int(item['slot']))
        pokemon.append({'id': number, 'name': names[number]['name'], 'slug': row['identifier'],
                        'genus': names[number]['genus'], 'height': int(row['height']) / 10,
                        'weight': int(row['weight']) / 10, 'types': [type_ids[int(item['type_id'])] for item in member_types],
                        'stats': stats, 'total': sum(stats.values()),
                        'evolvesFrom': int(species[number]['evolves_from_species_id'] or 0) or None,
                        'image': f'assets/pokemon/{number}.png'})
    pokemon.sort(key=lambda item: item['id'])
    assert len(pokemon) == 151 and all(len(item['stats']) == 6 for item in pokemon)

    def download_art(item):
        url = f'https://raw.githubusercontent.com/PokeAPI/sprites/{sprite_revision}/sprites/pokemon/other/official-artwork/{item["id"]}.png'
        path = ART / f'{item["id"]}.png'
        cached = CACHE / f'{sprite_revision}-art-{item["id"]}.png'
        raw = cached.read_bytes() if cached.exists() else fetch(url)
        assert raw.startswith(b'\x89PNG\r\n\x1a\n'), f'Invalid image: {item["id"]}'
        cached.write_bytes(raw)
        path.write_bytes(raw)
        return {'id': item['id'], 'file': item['image'], 'url': url, 'sha256': hashlib.sha256(raw).hexdigest()}

    with ThreadPoolExecutor(max_workers=4) as executor:
        images = list(executor.map(download_art, pokemon))
    collected_at = datetime.now(timezone.utc).isoformat()
    manifest = {'name': 'PokéAPI #001–151 default forms', 'retrievedAt': collected_at,
                'pokemonCount': len(pokemon), 'typeCount': len(types),
                'dataRevision': source_revision, 'spriteRevision': sprite_revision,
                'rules': 'Current standard 18-type efficacy; not Generation I battle rules',
                'units': {'height': 'metres (source decimetres / 10)', 'weight': 'kg (source hectograms / 10)'},
                'files': source_files, 'images': images}
    catalog = {'meta': {'retrievedAt': collected_at, 'dataRevision': source_revision,
                        'spriteRevision': sprite_revision}, 'types': types, 'pokemon': pokemon}
    (ROOT / 'js' / 'data' / 'catalog.js').write_text(
        '/* PokéAPI 公开数据快照；由 tools/build_catalog.py 整理。来源见 source-manifest.json。 */\n'
        + 'window.POKE_CATALOG = ' + json.dumps(catalog, ensure_ascii=False, indent=2) + ';\n', encoding='utf-8', newline='\n')
    (DATA / 'source-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
    print(f'Saved {len(pokemon)} records, {len(types)} types and {len(images)} local artworks.', flush=True)
    print(f'Data revision: {source_revision}; artwork revision: {sprite_revision}', flush=True)


if __name__ == '__main__':
    main()
