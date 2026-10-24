"""Extract this APK's Cricket PCM16 / PCM8 / ADPCM audio without external tools.

Format reference: vgmstream src/meta/ck.c and src/coding/msadpcm_decoder.c.
Outputs retain source names; no button-use mapping is assumed.
"""
from pathlib import Path
import array
import hashlib
import html
import json
import struct
import sys
import wave

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'reverse/original-apk/unpacked/assets/BGM'
OUTPUT = ROOT / 'reverse/original-apk/audio'
COEFFICIENTS = [(256, 0), (512, -256), (0, 0), (192, 64),
                (240, 0), (460, -208), (392, -232)]
ADAPTATION = [230, 230, 230, 230, 307, 409, 512, 614,
              768, 614, 512, 409, 307, 230, 230, 230]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def metadata(data, offset):
    codec, channels, rate, blocks, block_size, samples = struct.unpack_from(
        '<BBHIHH', data, offset)
    loop_start, loop_end, loop_count = struct.unpack_from('<IIh', data, offset + 16)
    assert codec in (0, 1, 2) and channels in (1, 2) and rate > 0
    return dict(codec=codec, channels=channels, sampleRate=rate,
                blocks=blocks, blockSize=block_size, samplesPerBlock=samples,
                frames=blocks * samples, loopStart=loop_start,
                loopEnd=loop_end, loopCount=loop_count)


def decode(data, info):
    channels = info['channels']
    block_size = info['blockSize']
    assert len(data) == info['blocks'] * block_size
    if info['codec'] == 0:
        assert len(data) == info['frames'] * channels * 2
        return data
    if info['codec'] == 1:
        assert len(data) == info['frames'] * channels
        pcm = array.array('h', ((value if value < 128 else value - 256) * 256 for value in data))
        if sys.byteorder != 'little':
            pcm.byteswap()
        return pcm.tobytes()
    stride = block_size // channels
    assert stride * channels == block_size
    assert info['samplesPerBlock'] == (stride - 7) * 2 + 2
    pcm = array.array('h')
    for base in range(0, len(data), block_size):
        tracks = []
        for channel in range(channels):
            frame = data[base + channel * stride:base + (channel + 1) * stride]
            predictor, delta, previous, current = struct.unpack_from('<Bhhh', frame)
            assert predictor < len(COEFFICIENTS) and delta >= 0
            c1, c2 = COEFFICIENTS[predictor]
            track = [previous, current]
            for byte in frame[7:]:
                for nibble in (byte & 15, byte >> 4):
                    signed = nibble if nibble < 8 else nibble - 16
                    value = ((current * c1 + previous * c2) >> 8) + signed * delta
                    value = max(-32768, min(32767, value))
                    previous, current = current, value
                    delta = max(16, ADAPTATION[nibble] * delta >> 8)
                    track.append(value)
            tracks.append(track)
        for frame in zip(*tracks):
            pcm.extend(frame)
    assert len(pcm) == info['frames'] * channels
    if sys.byteorder != 'little':
        pcm.byteswap()
    return pcm.tobytes()


def export(name, source_name, data, info, folder):
    assert Path(name).name == name and '/' not in name and '\\' not in name
    pcm = decode(data, info)
    target = OUTPUT / folder / (name + '.wav')
    target.parent.mkdir(parents=True, exist_ok=True)
    # Refuse to replace files whose decoded PCM differs.
    if target.exists():
        with wave.open(str(target), 'rb') as existing:
            assert existing.readframes(existing.getnframes()) == pcm, target
    else:
        with wave.open(str(target), 'wb') as output:
            output.setnchannels(info['channels'])
            output.setsampwidth(2)
            output.setframerate(info['sampleRate'])
            output.writeframes(pcm)
    with wave.open(str(target), 'rb') as check:
        assert check.getnframes() == info['frames']
        assert check.readframes(check.getnframes()) == pcm
    return dict(name=name, source=source_name, **info,
                seconds=round(info['frames'] / info['sampleRate'], 4),
                output=target.relative_to(OUTPUT).as_posix(),
                sha256=digest(target.read_bytes()), pcmSha256=digest(pcm),
                usage='unconfirmed')


def main():
    records = []
    sources = {}
    for source in sorted(SOURCE.glob('*')):
        if source.suffix not in ('.cks', '.ckb'):
            continue
        data = source.read_bytes()
        assert data[:4] == b'ckmk'
        assert struct.unpack_from('<I', data, 12)[0] == 2
        sources[source.name] = digest(data)
        if source.suffix == '.cks':
            info = metadata(data, 16)
            records.append(export(source.stem, source.name, data[44:], info, 'bgm'))
        else:
            count = struct.unpack_from('<I', data, 56)[0]
            offset = 72 + count * 72
            for index in range(count):
                header = 72 + index * 72
                name = data[header:header + 32].split(b'\0')[0].decode('ascii')
                info = metadata(data, header + 32)
                size = struct.unpack_from('<I', data, header + 60)[0]
                records.append(export(name, source.name, data[offset:offset + size], info, 'sfx'))
                offset += size
            assert offset == len(data), (source, offset, len(data))
    OUTPUT.mkdir(parents=True, exist_ok=True)
    manifest = dict(sources=sources, entries=records,
                    references=['https://github.com/vgmstream/vgmstream/blob/master/src/meta/ck.c',
                                'https://github.com/vgmstream/vgmstream/blob/master/src/coding/msadpcm_decoder.c'],
                    limitations=['No runtime button mapping established.',
                                 'WAV contains one pass, no repeated loops; loop metadata retained here.',
                                 'Cache/download-only music not present in base APK is not included.'])
    imported = []
    # These are audition candidates selected by short duration, NOT confirmed buttons.
    candidates = {'sse_009', 'sse_021', 'sse_021_2', 'sse_032', 'sse_035', 'sse_036'}
    for entry in records:
        if entry['source'].endswith('.cks'):
            relative = 'assets/resources/audio/bgm/' + entry['name'] + '.wav'
        elif entry['name'] in candidates:
            relative = 'assets/resources/audio/sfx/candidates/' + entry['name'] + '.wav'
        else:
            continue
        target = ROOT / relative
        content = (OUTPUT / entry['output']).read_bytes()
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            assert target.read_bytes() == content, f'Refusing overwrite: {target}'
        else:
            target.write_bytes(content)
        imported.append(dict(path=relative, sha256=digest(content), usage=entry['usage']))
    manifest['imported'] = imported
    (OUTPUT / 'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding='utf-8')
    rows = []
    for entry in records:
        rows.append('<tr><td>' + html.escape(entry['name']) + '</td><td>' +
                    str(entry['seconds']) + ' s</td><td><audio controls preload="none" src="' +
                    html.escape(entry['output'], quote=True) + '"></audio></td></tr>')
    page = '''<!doctype html><meta charset="utf-8"><title>原包音频试听</title>
<style>body{font:16px sans-serif;max-width:1000px;margin:32px auto;background:#151821;color:#eee}td{padding:8px;border-bottom:1px solid #444}input{padding:10px;width:95%}audio{height:32px}</style>
<h1>原包音频试听</h1><p>保留原始名称；按钮用途尚未确认。可按名称筛选，或搜索 sse_ 查看编号音效。</p>
<input placeholder="筛选名称" oninput="for(const row of document.querySelectorAll('tr'))row.hidden=!row.cells[0].textContent.toLowerCase().includes(this.value.toLowerCase())">
<table>''' + ''.join(rows) + '''</table><script>document.addEventListener('play',e=>{for(const a of document.querySelectorAll('audio'))if(a!==e.target)a.pause()},true)</script>'''
    (OUTPUT / 'listen.html').write_text(page, encoding='utf-8')
    print(f'Exported and verified {len(records)} WAV files to {OUTPUT}')
    print('BGM:', [e['name'] for e in records if e['source'].endswith('.cks')])
    print('Short numbered SFX:', [(e['name'], e['seconds']) for e in records
                                  if e['name'].startswith('sse_') and e['seconds'] <= 1])


if __name__ == '__main__':
    main()
