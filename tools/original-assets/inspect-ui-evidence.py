"""Decode selected original UI PNGs for offline evidence; never edits runtime assets."""
from pathlib import Path
import hashlib, io, json, re, struct, zlib, plistlib
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'reverse/original-apk/unpacked/assets'
OUT = ROOT / 'reverse/original-apk/ui-evidence'
KEY = bytes.fromhex('f01374af4c0d4819cbf6fb584478b4f29a0810509cd52cadf833351565e620147c')
paths = list((SOURCE / '04_title').glob('*.png'))
paths += list((SOURCE / '03_mypage/mypage_v10').glob('*.png'))
paths += list((SOURCE / '01_header/header_v10').glob('*.png'))
paths += list((SOURCE / '02_footer/footer_v10').glob('*.png'))
paths += list((SOURCE / 'extensions').glob('slider*.png'))
paths += [SOURCE/'00_common/btn_check.png', SOURCE/'00_common/btn_checkbox.png']
records = []
OUT.mkdir(parents=True, exist_ok=True)
for path in paths:
    raw = path.read_bytes()
    data = bytearray(raw)
    if not data.startswith(b'\x89PNG\r\n\x1a\n'):
        for i in range(min(1280, len(data))):
            data[i] ^= KEY[i % len(KEY)]
    assert data.startswith(b'\x89PNG\r\n\x1a\n'), path
    pos = 8
    while pos < len(data):
        size = struct.unpack_from('>I', data, pos)[0]
        block = data[pos+4:pos+8+size]
        assert zlib.crc32(block) == struct.unpack_from('>I', data, pos+8+size)[0], path
        pos += size + 12
    image = Image.open(io.BytesIO(data)); image.load()
    dest = OUT / path.relative_to(SOURCE)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    records.append({'source': str(path.relative_to(ROOT)), 'decoded': str(dest.relative_to(ROOT)),
                    'size': image.size, 'sha256': hashlib.sha256(data).hexdigest(), 'allChunkCrcsVerified': True})

# Export native atlas frames, undoing TexturePacker's clockwise packing rotation.
atlasFrames = []
for atlas in ['03_mypage/mypage_v10/mypage_v10','01_header/header_v10/header_v10','02_footer/footer_v10/footer_v10']:
    meta = plistlib.loads((SOURCE/(atlas+'.plist')).read_bytes())
    texture = Image.open(OUT/(atlas+'.png')).convert('RGBA')
    for name, frame in meta['frames'].items():
        x,y,w,h = map(int,re.findall(r'-?\d+',frame['textureRect']))
        rotated = frame['textureRotated']
        crop = texture.crop((x,y,x+(h if rotated else w),y+(w if rotated else h)))
        if rotated: crop = crop.transpose(Image.Transpose.ROTATE_90)
        assert crop.size == (w,h)
        dest = OUT / (atlas+'-frames') / name
        dest.parent.mkdir(parents=True,exist_ok=True)
        crop.save(dest)
        atlasFrames.append({'name':name,'output':str(dest.relative_to(ROOT)),'frame':frame})

views = ['NewTitle_Cf2','NewTitle_TapstartItem','TitleClockItem','MyPage_v10',
         'Mypage_effect_bg','MyPage_SettingDialog','AudioSettingDialog','Common_UI_Dialog']
strings = {}
for name in views:
    data = (SOURCE / 'View' / (name+'.ccbi')).read_bytes()
    strings[name] = [s.decode('utf8', 'replace') for s in re.findall(rb'[ -~]{4,}', data)]
(OUT / 'manifest.json').write_text(json.dumps({'images':records,'atlasFrames':atlasFrames,'ccbiReadableStrings':strings,
 'limitations':['Readable CCBI strings establish references, not numeric positions or runtime visibility.',
 'Images are original decoded pixels, not original runtime screenshots.']},ensure_ascii=False,indent=2),encoding='utf8')
tiles = []
for rec in records:
    image = Image.open(ROOT / rec['decoded']).convert('RGBA')
    image.thumbnail((260,350))
    tile = Image.new('RGB',(300,400),'#526073')
    tile.paste(image,((300-image.width)//2,30),image)
    draw = ImageDraw.Draw(tile)
    draw.text((5,5),Path(rec['decoded']).name,fill='white')
    draw.text((5,380),str(rec['size']),fill='white')
    tiles.append(tile)
sheet = Image.new('RGB',(1200,400*((len(tiles)+3)//4)),'#263040')
for i,tile in enumerate(tiles): sheet.paste(tile,((i%4)*300,(i//4)*400))
sheet.save(OUT/'contact-sheet.jpg')
print(json.dumps(records,indent=2))
