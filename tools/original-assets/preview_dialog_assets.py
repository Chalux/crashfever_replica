"""Verify decoded images with Pillow and build an unmodified-size contact sheet."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


project_root = Path(__file__).resolve().parents[2]
art_root = project_root / "assets/resources/ui/common/dialog/art"
output = project_root / "reverse/original-apk/dialog-assets-preview.png"
filenames = [
    "bgi_DialogFrame.png", "bgi_DialogFrame_100.png",
    "bgi_DialogTitle.png", "bgi_DialogTitle_L.png",
    "btn_DialogBlue.png", "btn_DialogBlue02.png",
    "btn_DialogGreen.png", "btn_DialogRed.png",
    "btn_DialogRed02.png", "btn_DialogClose.png",
]

font_path = Path("C:/Windows/Fonts/consola.ttf")
font = ImageFont.truetype(str(font_path), 16) if font_path.exists() else ImageFont.load_default()
cell_width, cell_height = 420, 165
sheet = Image.new("RGB", (cell_width * 2, cell_height * 5), "#20252d")
draw = ImageDraw.Draw(sheet)

for index, filename in enumerate(filenames):
    path = art_root / filename
    with Image.open(path) as asset:
        asset.verify()
    with Image.open(path) as asset:
        rgba = asset.convert("RGBA")
        rgba.load()
    x = (index % 2) * cell_width
    y = (index // 2) * cell_height
    for row in range(28, 156, 12):
        for col in range(8, 408, 12):
            color = "#38424d" if ((row - 28) // 12 + (col - 8) // 12) % 2 else "#46525f"
            draw.rectangle((x + col, y + row, x + min(col + 11, 407), y + min(row + 11, 155)), fill=color)
    draw.text((x + 10, y + 5), f"{filename}  {rgba.width}x{rgba.height}", fill="white", font=font)
    sheet.paste(rgba, (x + (cell_width - rgba.width) // 2, y + 28 + (128 - rgba.height) // 2), rgba)
    print(f"Pillow decode OK: {filename}")

sheet.save(output)
print(output)
