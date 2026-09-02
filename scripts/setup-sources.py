#!/usr/bin/env python3
"""Pinned PAGER source setup. Writes only sources docs and global skills/references.

No dependency installation, app edits, shell command interpolation, or deletion.
GitHub skill copies are obtained through Codex's skill-installer helper.
"""
from __future__ import annotations

import argparse
import collections
import datetime as dt
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import urllib.parse
import urllib.request
import zipfile

PROJECT = Path(__file__).resolve().parents[1]
CODEX = Path('C:/Users/elaza/.codex')
SKILLS = CODEX / 'skills'
REFERENCES = CODEX / 'references/pager-sources'
OPEN_DESIGN = Path('C:/Users/elaza/AppData/Local/Programs/Open Design/resources/open-design')
HELPER = SKILLS / '.system/skill-installer/scripts/install-skill-from-github.py'
LOCK = PROJECT / 'docs/sources.lock.json'
REPORT = PROJECT / 'docs/sources-report.md'
PREPARATION = REFERENCES / 'preparation.json'
# Observed from the repositories' default branches on 2026-09-02; never install a moving ref.
PINS = [
    ('anthropics/skills', 'main', '53048666b05b4799081517d00e09e0a2dd688678'),
    ('anthropics/claude-code', 'main', 'aef74afe01f65b602258d6102b0da9730ac6f0aa'),
    ('blader/humanizer', 'main', 'e2e92e7b4b8229253ed5c8e81dc65463fdeddda5'),
    ('Vladimir-Human/humanizer-ru', 'main', 'df918c383731c6063b064fd18cb243c05f4c1a9d'),
    ('Nutlope/hallmark', 'main', '13ac0ec7e148655948100b6396439e481361d690'),
    ('public-apis/public-apis', 'master', '9d0426870ee7edc9ffedf21cc5b2e87604819549'),
]


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def file_hash(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def save_json(path, value, *, exclusive=False):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('x' if exclusive else 'w', encoding='utf-8', newline='\n') as stream:
        json.dump(value, stream, indent=2, ensure_ascii=False)
        stream.write('\n')


def new_text(path, text):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('x', encoding='utf-8', newline='\n') as stream:
        stream.write(text)


def put_verified(path, data):
    """Resume our partial download only when an existing file is byte-identical."""
    path = Path(path)
    if path.exists():
        if path.read_bytes() != data:
            raise ValueError(f'Refusing to overwrite different existing bytes: {path}')
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('xb') as stream:
        stream.write(data)


def inside(path, root):
    resolved = Path(path).resolve()
    if not resolved.is_relative_to(Path(root).resolve()):
        raise ValueError(f'Path escapes intended root: {path}')
    return resolved


def tree_manifest(root):
    root = Path(root)
    result = {}
    for path in sorted(root.rglob('*')):
        if path.is_symlink() or (hasattr(path, 'is_junction') and path.is_junction()):
            raise ValueError(f'Unexpected link: {path}')
        if path.is_file():
            result[path.relative_to(root).as_posix()] = file_hash(path)
    return result


def manifest_digest(manifest):
    return sha256(json.dumps(manifest, sort_keys=True, separators=(',', ':')).encode())


def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'PAGER-source-setup',
                                                  'Accept': 'application/vnd.github+json'})
    with urllib.request.urlopen(request, timeout=45) as response:
        return response.read()


def api(path):
    return json.loads(fetch('https://api.github.com/' + path))


def skill_name(data):
    text = data.decode('utf-8-sig') if isinstance(data, bytes) else data
    frontmatter = re.match(r'\A---\r?\n(.*?)\r?\n---(?:\r?\n|$)', text, re.S)
    if not frontmatter:
        raise ValueError('Missing SKILL.md YAML frontmatter')
    names = re.findall(r'^name:[ \t]*(.+?)[ \t]*$', frontmatter[1], re.M)
    if len(names) != 1:
        raise ValueError('SKILL.md requires exactly one scalar name')
    return names[0].strip().strip('\"\'')


def inventory_existing():
    entries = []
    for root in (SKILLS, CODEX / 'plugins/cache'):
        proc = subprocess.run(['rg', '--files', '--hidden', '-g', 'SKILL.md', str(root)],
                              capture_output=True, text=True, check=True)
        for filename in proc.stdout.splitlines():
            path = Path(filename)
            entries.append({'name': skill_name(path.read_bytes()), 'directory': path.parent.name,
                            'path': path.as_posix(), 'sha256': file_hash(path)})
    return sorted(entries, key=lambda row: row['path'])


def license_kind(data):
    text = data.decode('utf-8', errors='replace')
    if 'SIL OPEN FONT LICENSE' in text or 'SIL Open Font License' in text:
        return 'OFL-1.1'
    if 'Apache License' in text and 'Version 2.0' in text:
        return 'Apache-2.0'
    if 'Permission is hereby granted, free of charge' in text:
        return 'MIT'
    if 'Anthropic' in text and ('Agreement' in text or 'Terms of Service' in text):
        return 'LicenseRef-Anthropic-Proprietary'
    return 'LicenseRef-Upstream-Notice'


def source_snapshot(repo, branch, commit):
    root = REFERENCES / 'repositories' / repo.replace('/', '--') / commit
    record = root / 'source.json'
    if record.exists():
        source = read_json(record)
        actual = tree_manifest(source['snapshot_path'])
        if actual != read_json(source['manifest_path']):
            raise ValueError(f'Existing source snapshot has changed: {repo}')
        if file_hash(source['archive_path']) != source['archive_sha256']:
            raise ValueError(f'Existing archive has changed: {repo}')
        return source
    commit_data = api(f'repos/{repo}/commits/{commit}')
    if commit_data['sha'] != commit:
        raise ValueError(f'Unexpected commit response: {repo}')
    tree = api(f'repos/{repo}/git/trees/{commit}?recursive=1')
    if tree.get('truncated'):
        raise ValueError(f'Incomplete GitHub tree: {repo}')
    blobs = {item['path']: item for item in tree['tree'] if item['type'] == 'blob'}
    if any(item.get('mode') == '120000' or item['type'] == 'commit' for item in tree['tree']):
        raise ValueError(f'Symlink/submodule requires explicit source inspection: {repo}')
    root.mkdir(parents=True, exist_ok=True)
    archive_url = f'https://codeload.github.com/{repo}/zip/{commit}'
    archive_path = root / 'source.zip'
    archive = archive_path.read_bytes() if archive_path.exists() else fetch(archive_url)
    put_verified(archive_path, archive)
    snapshot = root / 'snapshot'
    snapshot.mkdir(exist_ok=True)
    extracted = set()
    with zipfile.ZipFile(archive_path) as bundle:
        for item in bundle.infolist():
            parts = PurePosixPath(item.filename).parts
            if len(parts) < 2 or item.is_dir():
                continue
            relative = PurePosixPath(*parts[1:])
            if relative.is_absolute() or any(p in ('.', '..') or ':' in p or '\\' in p for p in relative.parts):
                raise ValueError(f'Unsafe archive entry: {item.filename}')
            name = relative.as_posix()
            if name not in blobs or name in extracted:
                raise ValueError(f'Unexpected or duplicate archive entry: {name}')
            data = bundle.read(item)
            blob_hash = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
            if blob_hash != blobs[name]['sha']:
                raise ValueError(f'Git blob mismatch: {repo}/{name}')
            target = inside(snapshot / Path(*relative.parts), snapshot)
            put_verified(target, data)
            extracted.add(name)
    # public-apis uses export-ignore for README.md and .github. Recover omitted
    # files from the same pinned commit, and verify their Git blob hashes too.
    recovered = []
    for name in sorted(set(blobs) - extracted):
        url = f'https://raw.githubusercontent.com/{repo}/{commit}/{urllib.parse.quote(name)}'
        data = fetch(url)
        blob_hash = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
        if blob_hash != blobs[name]['sha']:
            raise ValueError(f'Recovered Git blob mismatch: {repo}/{name}')
        put_verified(inside(snapshot / name, snapshot), data)
        recovered.append({'path': name, 'url': url, 'sha256': sha256(data), 'git_blob_sha': blob_hash})
    manifest = tree_manifest(snapshot)
    if set(manifest) != set(blobs):
        raise ValueError(f'Snapshot file list differs from Git tree: {repo}')
    manifest_path = root / 'files.sha256.json'
    save_json(manifest_path, manifest, exclusive=True)
    save_json(root / 'git-tree.json', tree, exclusive=True)
    save_json(root / 'commit.json', commit_data, exclusive=True)
    licenses = []
    for name, digest in manifest.items():
        if any(word in Path(name).name.upper() for word in ('LICENSE', 'LICENCE', 'NOTICE', 'COPYING', 'OFL')):
            licenses.append({'path': name, 'local_path': (snapshot / name).as_posix(),
                             'url': f'https://github.com/{repo}/blob/{commit}/{name}',
                             'sha256': digest, 'classification': license_kind((snapshot / name).read_bytes())})
    source = {'repo': repo, 'url': f'https://github.com/{repo}', 'observed_ref': branch,
              'commit': commit, 'commit_url': f'https://github.com/{repo}/commit/{commit}',
              'committed_at': commit_data['commit']['committer']['date'], 'observed_at': now(),
              'archive_url': archive_url, 'archive_path': archive_path.as_posix(),
              'archive_sha256': sha256(archive), 'snapshot_path': snapshot.as_posix(),
              'manifest_path': manifest_path.as_posix(), 'tree_sha256': manifest_digest(manifest),
              'git_tree_sha': tree['sha'], 'git_blob_verification': 'all files match pinned Git tree',
              'archive_omissions_recovered': recovered,
              'file_count': len(manifest), 'bytes': sum((snapshot / name).stat().st_size for name in manifest),
              'skill_paths': sorted(name for name in manifest if Path(name).name == 'SKILL.md'),
              'licenses': licenses}
    save_json(record, source, exclusive=True)
    print(f'Snapshot verified: {repo}@{commit[:12]} ({len(manifest)} files)', flush=True)
    return source


def prepare():
    if PREPARATION.exists():
        prep = read_json(PREPARATION)
    else:
        REFERENCES.mkdir(parents=True, exist_ok=True)
        existing = inventory_existing()
        package = OPEN_DESIGN.parent / 'app/package.json'
        # Read-only resource baseline; no app launch, configuration, credential access or edits.
        app_manifest = tree_manifest(OPEN_DESIGN)
        app_manifest_path = REFERENCES / 'open-design-before.sha256.json'
        save_json(app_manifest_path, app_manifest, exclusive=True)
        system_manifest_path = REFERENCES / 'existing-global-before.sha256.json'
        save_json(system_manifest_path, tree_manifest(SKILLS), exclusive=True)
        prep = {'started_at': now(), 'existing_registrations': existing,
                'existing_global_manifest': system_manifest_path.as_posix(),
                'existing_global_manifest_sha256': file_hash(system_manifest_path),
                'open_design': {'path': OPEN_DESIGN.as_posix(), 'version': read_json(package)['version'],
                                'package_path': package.as_posix(), 'package_sha256': file_hash(package),
                                'manifest_path': app_manifest_path.as_posix(),
                                'tree_sha256': manifest_digest(app_manifest), 'file_count': len(app_manifest)},
                'sources': []}
        save_json(PREPARATION, prep, exclusive=True)
    for repo, branch, commit in PINS:
        if not any(s['repo'] == repo for s in prep['sources']):
            prep['sources'].append(source_snapshot(repo, branch, commit))
            save_json(PREPARATION, prep)
    # Include per-font OFL files as well as repository/skill licenses in the registry.
    for source in prep['sources']:
        licenses = []
        snapshot = Path(source['snapshot_path'])
        for name, digest in read_json(source['manifest_path']).items():
            if any(word in Path(name).name.upper() for word in ('LICENSE', 'LICENCE', 'NOTICE', 'COPYING', 'OFL')):
                licenses.append({'path': name, 'local_path': (snapshot / name).as_posix(),
                                 'url': f'https://github.com/{source["repo"]}/blob/{source["commit"]}/{name}',
                                 'sha256': digest, 'classification': license_kind((snapshot / name).read_bytes())})
        if licenses != source['licenses']:
            source['licenses'] = licenses
            save_json(snapshot.parent / 'source.json', source)
    save_json(PREPARATION, prep)
    print(f'Prepared {len(prep["sources"])} sources; baseline {len(prep["existing_registrations"])} existing registrations.', flush=True)
    return prep


def select_skills(source):
    repo = source['repo']
    if repo == 'anthropics/skills':
        return [str(PurePosixPath(p).parent) for p in source['skill_paths']]
    return {
        'anthropics/claude-code': ['plugins/frontend-design/skills/frontend-design'],
        'blader/humanizer': ['.'],
        'Vladimir-Human/humanizer-ru': ['.'],
        'Nutlope/hallmark': ['skills/hallmark'],
        'public-apis/public-apis': [],
    }[repo]


def plan_registrations(prep):
    existing = inventory_existing()
    occupied = {x['name'].casefold() for x in existing} | {x['directory'].casefold() for x in existing}
    # The name frontend-design is reserved for the source explicitly requested in SPEC.
    reserved = {'frontend-design', 'public-apis', 'open-design'}
    plans = []
    for source in prep['sources']:
        for relative in select_skills(source):
            original = skill_name((Path(source['snapshot_path']) / relative / 'SKILL.md').read_bytes())
            collisions = [x for x in existing if original.casefold() in (x['name'].casefold(), x['directory'].casefold())]
            conflicts = original.casefold() in occupied
            if source['repo'] == 'anthropics/skills' and (conflicts or original in reserved):
                registered = 'anthropic-' + original
                reason = 'existing name/directory' if conflicts else 'canonical claude-code frontend-design reserved'
            else:
                registered, reason = original, None
            if registered.casefold() in occupied or (SKILLS / registered).exists():
                raise ValueError(f'Existing registration needs inspection; refusing overwrite: {registered}')
            if not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,63}', registered):
                raise ValueError(f'Invalid registration name: {registered}')
            occupied.add(registered.casefold())
            plans.append({'repo': source['repo'], 'source_path': relative, 'source_name': original,
                          'registered_name': registered, 'namespace_reason': reason, 'collisions': collisions})
    for name in ('public-apis', 'open-design'):
        if name in occupied or (SKILLS / name).exists():
            raise ValueError(f'Existing bridge registration needs inspection: {name}')
    return plans


def helper_stage(source, plans):
    paths = select_skills(source)
    if not paths:
        return None, None
    staging = REFERENCES / 'installer-staging' / source['repo'].replace('/', '--') / source['commit']
    completion = staging.parent / (source['commit'] + '.helper.json')
    arguments = [sys.executable, '-B', str(HELPER), '--repo', source['repo'], '--ref', source['commit'],
                 '--path', *paths, '--dest', str(staging), '--method', 'download']
    if paths == ['.']:
        arguments += ['--name', plans[0]['source_name']]
    if not completion.exists():
        if staging.exists():
            raise ValueError(f'Incomplete installer staging; inspect without deleting: {staging}')
        helper_temp = REFERENCES / 'installer-temp'
        helper_temp.mkdir(parents=True, exist_ok=True)
        env = dict(os.environ, PYTHONDONTWRITEBYTECODE='1', PYTHONUTF8='1',
                   TEMP=str(helper_temp), TMP=str(helper_temp))
        proc = subprocess.run(arguments, capture_output=True, text=True, encoding='utf-8', env=env)
        evidence = {'arguments': arguments, 'exit_code': proc.returncode, 'stdout': proc.stdout,
                    'stderr': proc.stderr, 'helper_sha256': file_hash(HELPER), 'at': now()}
        if proc.returncode:
            save_json(staging.parent / (source['commit'] + '.failed-helper.json'), evidence)
            raise RuntimeError(proc.stderr.strip())
        save_json(completion, evidence, exclusive=True)
    for plan in plans:
        stage_name = plan['source_name'] if plan['source_path'] == '.' else Path(plan['source_path']).name
        if tree_manifest(staging / stage_name) != tree_manifest(Path(source['snapshot_path']) / plan['source_path']):
            raise ValueError(f'Installer copy differs from verified snapshot: {stage_name}')
    print(f'Installer helper verified: {source["repo"]} ({len(paths)} skills)', flush=True)
    return staging, completion


def activate_skill(source, plan, staging, helper_evidence):
    registered = plan['registered_name']
    target = inside(SKILLS / registered, SKILLS)
    stage_name = plan['source_name'] if plan['source_path'] == '.' else Path(plan['source_path']).name
    original_root = Path(source['snapshot_path']) / plan['source_path']
    original_files = tree_manifest(original_root)
    # copytree's default dirs_exist_ok=False is deliberate, even after preflight.
    shutil.copytree(staging / stage_name, target)
    transforms = []
    skill_path = target / 'SKILL.md'
    original_bytes = skill_path.read_bytes()
    if plan['source_name'] != registered:
        adapted = re.sub(rb'(?m)^name:[ \t]*[^\r\n]+', b'name: ' + registered.encode('ascii'), original_bytes, count=1)
        skill_path.write_bytes(adapted)
        transforms.append({'type': 'frontmatter-name', 'source_path': 'SKILL.md', 'installed_path': 'SKILL.md',
                           'from': plan['source_name'], 'to': registered, 'original_sha256': sha256(original_bytes),
                           'installed_sha256': sha256(adapted), 'body_unchanged': True})
    # humanizer-ru contains a second distribution of the same skill for dsh.
    # Keep its bytes, but prevent recursive Codex scanning from registering it twice.
    for relative in original_files:
        if relative != 'SKILL.md' and Path(relative).name == 'SKILL.md':
            old = inside(target / relative, target)
            new = old.with_name('SKILL.upstream.md')
            if new.exists():
                raise ValueError(f'Nested source rename would overwrite: {new}')
            old.rename(new)
            transforms.append({'type': 'inactive-nested-distribution', 'source_path': relative,
                               'installed_path': new.relative_to(target).as_posix(),
                               'original_sha256': original_files[relative], 'installed_sha256': original_files[relative]})
    provenance = target / '_pager_source'
    provenance.mkdir()
    put_verified(provenance / 'SKILL.upstream.md', original_bytes)
    root = Path(source['snapshot_path'])
    # Skill-local licenses stay in their original paths. Ancestor notices and README
    # are also supplied locally; the complete repository remains in references.
    context = []
    for name in ('README.md', 'THIRD_PARTY_NOTICES.md', 'LICENSE', 'LICENSE.md', 'LICENSE.txt', 'NOTICE'):
        if (root / name).is_file():
            put_verified(provenance / 'repository' / name, (root / name).read_bytes())
            context.append(name)
    relative_prefix = '' if plan['source_path'] == '.' else plan['source_path'] + '/'
    relevant_licenses = [license for license in source['licenses']
                         if license['path'].startswith(relative_prefix) or '/' not in license['path']]
    declared = re.search(r'^license:[ \t]*(.+)$', original_bytes.decode('utf-8'), re.M)
    # No license is invented for doc-coauthoring/template, which ship no license file.
    skill_licenses = [item for item in relevant_licenses if item['path'].startswith(relative_prefix)
                      and 'NOTICE' not in Path(item['path']).name.upper()]
    if not skill_licenses:
        skill_licenses = [item for item in relevant_licenses if '/' not in item['path']
                          and 'NOTICE' not in Path(item['path']).name.upper()]
    license_label = ', '.join(sorted({x['classification'] for x in skill_licenses})) or 'not separately specified; see source notices'
    if source['repo'] == 'anthropics/claude-code':
        license_label = 'LicenseRef-Anthropic-Proprietary'
    record = dict(plan, kind='github-skill', commit=source['commit'], observed_ref=source['observed_ref'],
                  source_url=f'https://github.com/{source["repo"]}/tree/{source["commit"]}/{plan["source_path"]}',
                  source_skill_url=f'https://github.com/{source["repo"]}/blob/{source["commit"]}/' +
                  ('' if plan['source_path'] == '.' else plan['source_path'] + '/') + 'SKILL.md',
                  original_path=original_root.as_posix(), path=target.as_posix(),
                  original_skill_sha256=sha256(original_bytes), installed_skill_sha256=file_hash(skill_path),
                  source_file_count=len(original_files), source_tree_sha256=manifest_digest(original_files),
                  license=license_label, declared_license=declared[1] if declared else None,
                  licenses=relevant_licenses, transformations=transforms, repository_context_files=context,
                  installer_evidence_path=helper_evidence.as_posix())
    save_json(provenance / 'source.json', record, exclusive=True)
    manifest = tree_manifest(target)
    manifest_path = REFERENCES / 'installed-manifests' / (registered + '.sha256.json')
    save_json(manifest_path, manifest, exclusive=True)
    record.update(installed_manifest_path=manifest_path.as_posix(), installed_tree_sha256=manifest_digest(manifest),
                  installed_file_count=len(manifest))
    print(f'Registered {registered}', flush=True)
    return record


def parse_public_apis(readme):
    rows = []
    category = None
    for number, line in enumerate(readme.splitlines(), 1):
        if line.startswith('### '):
            category = line[4:].strip()
        if '|' not in line or not category:
            continue
        cells = [cell.strip() for cell in re.split(r'(?<!\\)\|', line.strip().strip('|'))]
        # Some upstream rows add empty trailing columns; MapQuest has an extra
        # nonempty column. Keep all API rows and expose anomalies instead of dropping them.
        while len(cells) > 5 and not cells[-1]:
            cells.pop()
        if len(cells) < 5:
            continue
        link = re.fullmatch(r'\[([^\]]+)\]\((https?://.+)\)', cells[0])
        if link:
            entry = {'category': category, 'name': link[1], 'url': link[2].strip(), 'description': cells[1],
                     'auth': cells[2], 'https': cells[3], 'cors': cells[4], 'source_line': number}
            if link[2] != link[2].strip():
                entry['upstream_url_raw'] = link[2]
            if len(cells) > 5:
                entry['upstream_extra_columns'] = cells[5:]
            rows.append(entry)
    if len(rows) < 100:
        raise ValueError(f'Unexpected public-apis table shape: only {len(rows)} entries')
    return rows


def finish_local_registration(name, kind, contents, data):
    target = inside(SKILLS / name, SKILLS)
    target.mkdir()
    new_text(target / 'SKILL.md', contents)
    if skill_name((target / 'SKILL.md').read_bytes()) != name:
        raise ValueError('Local registration name does not match directory')
    save_json(target / 'source.json', data, exclusive=True)
    manifest = tree_manifest(target)
    path = REFERENCES / 'installed-manifests' / (name + '.sha256.json')
    save_json(path, manifest, exclusive=True)
    return dict(kind=kind, registered_name=name, path=target.as_posix(), installed_manifest_path=path.as_posix(),
                installed_tree_sha256=manifest_digest(manifest), installed_file_count=len(manifest), **data)


def create_public_reference(source):
    snapshot = Path(source['snapshot_path'])
    rows = parse_public_apis((snapshot / 'README.md').read_text(encoding='utf-8'))
    counts = collections.Counter(row['category'] for row in rows)
    index_root = REFERENCES / 'indexes/public-apis' / source['commit']
    index_root.mkdir(parents=True)
    index_path = index_root / 'index.json'
    save_json(index_path, {'repo': source['repo'], 'commit': source['commit'],
                          'readme_sha256': file_hash(snapshot / 'README.md'), 'entry_count': len(rows),
                          'categories': dict(counts), 'entries': rows}, exclusive=True)
    markdown = ['# Public APIs local index', '', f'Pinned source: {source["commit_url"]}', '',
                f'{len(rows)} API entries in {len(counts)} categories. Upstream listings; availability is not certified.', '',
                f'Full original list: [{snapshot / "README.md"}]({(snapshot / "README.md").as_posix()})', '',
                '| Category | Entries | First README line |', '| --- | ---: | ---: |']
    for category, count in counts.items():
        line = next(row['source_line'] for row in rows if row['category'] == category)
        markdown.append(f'| {category} | {count} | {line} |')
    new_text(index_root / 'INDEX.md', '\n'.join(markdown) + '\n')
    data = {'repo': source['repo'], 'commit': source['commit'], 'observed_ref': source['observed_ref'],
            'source_url': source['commit_url'], 'snapshot_path': snapshot.as_posix(), 'license': 'MIT',
            'license_path': (snapshot / 'LICENSE').as_posix(), 'index_path': index_path.as_posix(),
            'index_sha256': file_hash(index_path), 'index_markdown_path': (index_root / 'INDEX.md').as_posix(),
            'index_markdown_sha256': file_hash(index_root / 'INDEX.md'),
            'entry_count': len(rows), 'category_count': len(counts), 'integration_status': 'offline reference only'}
    text = f'''---
name: public-apis
description: "Find and compare APIs in the pinned local public-apis directory. Use for API discovery and auth, HTTPS, or CORS lookup; supports Russian and English requests."
---

# Public APIs reference

Local index: `{index_path.as_posix()}`
Category index: `{(index_root / 'INDEX.md').as_posix()}`
Complete original source: `{snapshot.as_posix()}`
Commit: `{source['commit']}`. License: `{(snapshot / 'LICENSE').as_posix()}`.

Search the JSON index by name, category or description with PowerShell or Python.
Each entry includes its original README line and URL. Read the original entry for context.
The catalog is a historical reference, not an installed API integration. Check the
provider's current official documentation before implementation. Do not infer current
availability, pricing, authentication or data-use rights from this listing.
Answer in the user's language, including Russian or English.
'''
    return finish_local_registration('public-apis', 'local-reference-index', text, data)


def create_open_design_bridge(prep):
    app = prep['open_design']
    index_root = REFERENCES / 'indexes/open-design' / app['tree_sha256'][:16]
    index_root.mkdir(parents=True)
    rows = []
    for path in sorted((OPEN_DESIGN / 'skills').rglob('SKILL.md')):
        rows.append({'name': skill_name(path.read_bytes()), 'path': path.as_posix(),
                     'directory': path.parent.as_posix(), 'sha256': file_hash(path)})
    index_path = index_root / 'skills-index.json'
    save_json(index_path, {'application_path': OPEN_DESIGN.as_posix(), 'version': app['version'],
                          'entries': rows, 'note': 'Read-only index; these are not individually registered in Codex.'}, exclusive=True)
    new_text(index_root / 'INDEX.md', '# Open Design local bridge\n\n' +
             '\n'.join(f'- {row["name"]}: `{row["path"]}`' for row in rows) + '\n')
    # Preserve the installed app's own licensing explanation, without copying its runtime.
    put_verified(index_root / 'skills-README.upstream.md', (OPEN_DESIGN / 'skills/README.md').read_bytes())
    data = dict(app, source_url=None, upstream_commit=None, kind_of_revision='local resource SHA-256 manifest',
                target_path=OPEN_DESIGN.as_posix(), index_path=index_path.as_posix(), index_sha256=file_hash(index_path),
                indexed_skill_count=len(rows), license='per installed resource; skills README declares Apache-2.0 with per-skill exceptions',
                license_evidence_path=(OPEN_DESIGN / 'skills/README.md').as_posix(),
                bridge_mode='read-only path and resource index; no junction, runtime installation or launch',
                integration_status='local reference bridge; application runtime not exercised')
    # Do not reuse the target's `path` field as the registration path.
    data.pop('path')
    contents = f'''---
name: open-design
description: "Use the existing Open Design installation as a local design resource library. Locate its skills, design systems and templates through a read-only bridge; supports Russian and English requests."
---

# Open Design local bridge

Exact installed application resource root:
`{OPEN_DESIGN.as_posix()}`

Local skill index: `{index_path.as_posix()}`
Observed app version: `{app['version']}`. Resource manifest SHA-256: `{app['tree_sha256']}`.

Read the index to select relevant resources. Read a selected skill in its original
directory and resolve its relative references against that directory. Design systems
live under `design-systems`, rendering templates under `design-templates`, and functional
skills under `skills`, all relative to the exact resource root above.

Treat installed resources as read-only. Write generated artifacts to the current task's
authorized workspace. Do not modify, move, reinstall, update or launch the application
as part of this bridge. Do not read credentials or local account configuration.
The index does not register the application's internal skills in Codex or imply a
live MCP/API connection. Some bundled entries point to upstream repositories and
may not include complete workflows. Respect each resource's original license notice.
If an expected bundled reference is absent, report the missing local path.
Answer in the user's language, including Russian or English.
'''
    return finish_local_registration('open-design', 'local-application-bridge', contents, data)


def install():
    if LOCK.exists():
        verify()
        print('Existing locked installation verified; nothing overwritten.', flush=True)
        return
    prep = prepare()
    plans = plan_registrations(prep)
    # Persist the complete plan before any activation so interrupted runs remain inspectable.
    plan_path = REFERENCES / 'installation-plan.json'
    if plan_path.exists():
        if read_json(plan_path) != plans:
            raise ValueError('Existing installation plan differs; inspect partial setup')
    else:
        save_json(plan_path, plans, exclusive=True)
    registrations = []
    for source in prep['sources']:
        selected = [p for p in plans if p['repo'] == source['repo']]
        staging, evidence = helper_stage(source, selected)
        for plan in selected:
            registrations.append(activate_skill(source, plan, staging, evidence))
    public = next(s for s in prep['sources'] if s['repo'] == 'public-apis/public-apis')
    registrations += [create_public_reference(public), create_open_design_bridge(prep)]
    lock = {'schema_version': 1, 'product': 'PAGER', 'installed_at': now(), 'source_spec': 'docs/SPEC.md#source-installation',
            'global_skills_root': SKILLS.as_posix(), 'global_reference_root': REFERENCES.as_posix(),
            'installer': {'path': HELPER.as_posix(), 'sha256': file_hash(HELPER),
                          'support_path': (HELPER.parent / 'github_utils.py').as_posix(),
                          'support_sha256': file_hash(HELPER.parent / 'github_utils.py')},
            'preparation_path': PREPARATION.as_posix(), 'sources': prep['sources'], 'registrations': registrations,
            'policy': {'existing_skills': 'inspect and never overwrite', 'canonical_frontend_design': 'anthropics/claude-code',
                       'anthropic_conflict_prefix': 'anthropic-', 'source_fidelity': 'unaltered complete snapshots, Git blob checks and SHA-256 manifests',
                       'registration_adaptations': 'only explicit frontmatter renames and inactive nested SKILL filename recorded per skill',
                       'app_runtime': 'not changed or launched', 'updates': 'check-updates is read-only; install is pinned and non-overwriting'}}
    save_json(LOCK, lock, exclusive=True)
    result = verify()
    save_json(PROJECT / 'docs/sources-verification.json', result)
    print(f'Installed and verified {len(registrations)} registrations.', flush=True)


def verify():
    lock = read_json(LOCK)
    prep = read_json(lock['preparation_path'])
    checks = []
    for source in lock['sources']:
        actual = tree_manifest(source['snapshot_path'])
        expected = read_json(source['manifest_path'])
        if actual != expected or manifest_digest(actual) != source['tree_sha256']:
            raise ValueError(f'Source snapshot drift: {source["repo"]}')
        if file_hash(source['archive_path']) != source['archive_sha256']:
            raise ValueError(f'Archive drift: {source["repo"]}')
    checks.append('All complete source snapshots and archives match pinned SHA-256 manifests.')
    for registration in lock['registrations']:
        root = Path(registration['path'])
        actual = tree_manifest(root)
        if actual != read_json(registration['installed_manifest_path']) or manifest_digest(actual) != registration['installed_tree_sha256']:
            raise ValueError(f'Installed resource drift: {registration["registered_name"]}')
        if root.name != registration['registered_name'] or skill_name((root / 'SKILL.md').read_bytes()) != root.name:
            raise ValueError(f'Registration directory/name mismatch: {root}')
        if registration['kind'] == 'github-skill':
            source_root = Path(registration['original_path'])
            transforms = {x['source_path']: x for x in registration['transformations']}
            for relative, original_hash in tree_manifest(source_root).items():
                transform = transforms.get(relative)
                installed = root / (transform['installed_path'] if transform else relative)
                expected = transform['installed_sha256'] if transform else original_hash
                if file_hash(installed) != expected:
                    raise ValueError(f'Lost or changed upstream material: {installed}')
            if (root / '_pager_source/SKILL.upstream.md').read_bytes() != (source_root / 'SKILL.md').read_bytes():
                raise ValueError(f'Original skill source not preserved: {root}')
    checks.append('All installed files, licenses and referenced repository materials preserved; only recorded registration adaptations differ.')
    expected_skills = next(s['skill_paths'] for s in lock['sources'] if s['repo'] == 'anthropics/skills')
    actual_skills = [r['source_path'] + '/SKILL.md' for r in lock['registrations'] if r.get('repo') == 'anthropics/skills']
    if sorted(expected_skills) != sorted(actual_skills):
        raise ValueError('Incomplete anthropics/skills coverage')
    canonical = next(r for r in lock['registrations'] if r['registered_name'] == 'frontend-design')
    if canonical['repo'] != 'anthropics/claude-code' or canonical['source_path'] != 'plugins/frontend-design/skills/frontend-design':
        raise ValueError('Canonical frontend-design source is incorrect')
    checks.append(f'Every anthropics/skills SKILL.md installed ({len(actual_skills)} including template); canonical frontend-design is from the requested plugin.')
    current = inventory_existing()
    for registration in lock['registrations']:
        name = registration['registered_name'].casefold()
        matches = [row for row in current if row['name'].casefold() == name]
        if len(matches) != 1 or matches[0]['path'] != (Path(registration['path']) / 'SKILL.md').as_posix():
            raise ValueError(f'Ambiguous skill registration: {name}')
    for entry in prep['existing_registrations']:
        if file_hash(entry['path']) != entry['sha256']:
            raise ValueError(f'Existing skill changed: {entry["path"]}')
    before = read_json(prep['existing_global_manifest'])
    if file_hash(prep['existing_global_manifest']) != prep['existing_global_manifest_sha256']:
        raise ValueError('Existing-global baseline manifest changed')
    for relative, digest in before.items():
        if file_hash(SKILLS / relative) != digest:
            raise ValueError(f'Existing global skill material changed: {relative}')
    checks.append(f'New names are unique across global/plugin catalogs; {len(prep["existing_registrations"])} existing SKILL files and all original global materials unchanged.')
    public = next(r for r in lock['registrations'] if r['kind'] == 'local-reference-index')
    rows = parse_public_apis((Path(public['snapshot_path']) / 'README.md').read_text(encoding='utf-8'))
    if rows != read_json(public['index_path'])['entries'] or len(rows) != public['entry_count']:
        raise ValueError('Public API index does not match pinned README')
    if file_hash(public['index_path']) != public['index_sha256'] or file_hash(public['index_markdown_path']) != public['index_markdown_sha256']:
        raise ValueError('Public API index drift')
    checks.append(f'Public API index regenerates exactly: {len(rows)} entries in {public["category_count"]} categories.')
    bridge = next(r for r in lock['registrations'] if r['kind'] == 'local-application-bridge')
    if Path(bridge['target_path']) != OPEN_DESIGN or file_hash(bridge['index_path']) != bridge['index_sha256']:
        raise ValueError('Open Design bridge target/index changed')
    app_manifest = tree_manifest(OPEN_DESIGN)
    if app_manifest != read_json(bridge['manifest_path']) or manifest_digest(app_manifest) != bridge['tree_sha256']:
        raise ValueError('Installed Open Design resources changed since baseline')
    if file_hash(bridge['package_path']) != bridge['package_sha256']:
        raise ValueError('Open Design application package changed')
    checks.append(f'Exact Open Design path, package and all {bridge["file_count"]} original resource files unchanged.')
    result = {'verified_at': now(), 'status': 'passed', 'registration_count': len(lock['registrations']),
              'github_skill_count': sum(r['kind'] == 'github-skill' for r in lock['registrations']),
              'checks': checks, 'scope': 'source setup only; app access/payment/inventory tests and production build remain with the app owners'}
    print(f'Verification passed: {len(checks)} checks, {len(lock["registrations"])} registrations.', flush=True)
    return result


def check_updates():
    lock = read_json(LOCK)
    for source in lock['sources']:
        latest = api(f'repos/{source["repo"]}/commits/{source["observed_ref"]}')['sha']
        print(json.dumps({'repo': source['repo'], 'installed': source['commit'], 'observed_latest': latest,
                          'update_available': latest != source['commit']}), flush=True)


def reindex_public_apis():
    """Rebuild only generated index/registry data; preserve all upstream bytes."""
    lock = read_json(LOCK)
    public = next(r for r in lock['registrations'] if r['kind'] == 'local-reference-index')
    target = inside(Path(public['path']), SKILLS)
    if target.name != 'public-apis' or tree_manifest(target) != read_json(public['installed_manifest_path']):
        raise ValueError('Managed public-apis bridge has drifted; refusing rewrite')
    for field in ('index_path', 'index_markdown_path'):
        inside(public[field], REFERENCES / 'indexes/public-apis')
        digest_key = 'index_sha256' if field == 'index_path' else 'index_markdown_sha256'
        if file_hash(public[field]) != public[digest_key]:
            raise ValueError(f'Managed index has drifted: {public[field]}')
    source = next(s for s in lock['sources'] if s['repo'] == 'public-apis/public-apis')
    snapshot = Path(source['snapshot_path'])
    if tree_manifest(snapshot) != read_json(source['manifest_path']):
        raise ValueError('Pinned public-apis snapshot has drifted')
    rows = parse_public_apis((snapshot / 'README.md').read_text(encoding='utf-8'))
    counts = collections.Counter(row['category'] for row in rows)
    save_json(public['index_path'], {'repo': source['repo'], 'commit': source['commit'],
                                   'readme_sha256': file_hash(snapshot / 'README.md'), 'entry_count': len(rows),
                                   'categories': dict(counts), 'entries': rows})
    lines = ['# Public APIs local index', '', f'Pinned source: {source["commit_url"]}', '',
             f'{len(rows)} API entries in {len(counts)} categories. Upstream listings; availability is not certified.', '',
             'Empty extra columns are ignored; nonempty extra columns and whitespace in original URLs are recorded in JSON.', '',
             f'Full original list: [{snapshot / "README.md"}]({(snapshot / "README.md").as_posix()})', '',
             '| Category | Entries | First README line |', '| --- | ---: | ---: |']
    for category, count in counts.items():
        line = next(row['source_line'] for row in rows if row['category'] == category)
        lines.append(f'| {category} | {count} | {line} |')
    Path(public['index_markdown_path']).write_text('\n'.join(lines) + '\n', encoding='utf-8', newline='\n')
    public.update(entry_count=len(rows), category_count=len(counts), index_sha256=file_hash(public['index_path']),
                  index_markdown_sha256=file_hash(public['index_markdown_path']))
    provenance = read_json(target / 'source.json')
    for key in ('entry_count', 'category_count', 'index_sha256', 'index_markdown_sha256'):
        provenance[key] = public[key]
    save_json(target / 'source.json', provenance)
    manifest = tree_manifest(target)
    save_json(public['installed_manifest_path'], manifest)
    public['installed_tree_sha256'] = manifest_digest(manifest)
    save_json(LOCK, lock)
    save_json(PROJECT / 'docs/sources-verification.json', verify())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['prepare', 'install', 'verify', 'check-updates', 'reindex-public-apis'])
    args = parser.parse_args()
    {'prepare': prepare, 'install': install, 'verify': verify, 'check-updates': check_updates,
     'reindex-public-apis': reindex_public_apis}[args.command]()


if __name__ == '__main__':
    main()
