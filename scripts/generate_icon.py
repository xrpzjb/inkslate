"""
生成 Inkslate 猫头鹰图标：扁平化 + 渐变风格
输出: resources/icon.png (1024x1024)
      resources/icon.ico (多尺寸 Windows)
      resources/icon.icns (多尺寸 macOS)
      src/renderer/icon.png (favicon 同步)
"""
import os
import struct
from PIL import Image, ImageDraw

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "resources")
os.makedirs(OUT_DIR, exist_ok=True)

SIZE = 1024

# ---------- 调色板 ----------
BG_TOP    = (91, 124, 250)    # #5B7CFA
BG_BOT    = (58, 79, 184)     # #3A4FB8
BODY_TOP  = (123, 79, 184)    # #7B4FB8
BODY_BOT  = (74, 46, 140)     # #4A2E8C
BELLY_TOP = (244, 213, 141)   # #F4D58D
BELLY_BOT = (232, 177, 74)    # #E8B14A
EYE_DARK  = (42, 24, 88)      # #2A1858
EYE_LIGHT = (255, 255, 255)   # #FFFFFF
EYE_LIGHT2= (232, 234, 246)   # #E8EAF6
PUPIL     = (15, 15, 30)      # #0F0F1E
WING      = (58, 34, 117)     # #3A2275
BEAK      = (244, 160, 45)    # #F4A02D
BEAK_DARK = (216, 120, 16)    # #D87810
FEATHER   = (198, 138, 26)    # #C68A1A

# ---------- 渐变工具 ----------
def lerp(a, b, t): return int(a + (b - a) * t)
def lerp_color(c1, c2, t):
    return (lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t), 255)

def fill_rounded_gradient(img, x0, y0, x1, y1, radius, c1, c2, diagonal=True):
    px = img.load()
    for y in range(y0, y1):
        for x in range(x0, x1):
            dx = dy = 0
            if x < x0 + radius and y < y0 + radius:
                dx = (x0 + radius) - x; dy = (y0 + radius) - y
            elif x > x1 - radius - 1 and y < y0 + radius:
                dx = x - (x1 - radius - 1); dy = (y0 + radius) - y
            elif x < x0 + radius and y > y1 - radius - 1:
                dx = (x0 + radius) - x; dy = y - (y1 - radius - 1)
            elif x > x1 - radius - 1 and y > y1 - radius - 1:
                dx = x - (x1 - radius - 1); dy = y - (y1 - radius - 1)
            if dx * dx + dy * dy > radius * radius:
                continue
            t = ((x - x0) + (y - y0)) / max(1, 2 * (x1 - x0)) if diagonal else (y - y0) / max(1, y1 - y0)
            t = max(0.0, min(1.0, t))
            px[x, y] = lerp_color(c1, c2, t)

def fill_ellipse_vgrad(img, cx, cy, rx, ry, c1, c2):
    px = img.load()
    for y in range(int(cy - ry), int(cy + ry) + 1):
        for x in range(int(cx - rx), int(cx + rx) + 1):
            nx = (x - cx) / rx; ny = (y - cy) / ry
            if nx * nx + ny * ny > 1: continue
            t = (y - (cy - ry)) / max(1, 2 * ry)
            px[x, y] = lerp_color(c1, c2, t)

def fill_circle(img, cx, cy, r, color):
    px = img.load()
    r2 = r * r
    for y in range(int(cy - r), int(cy + r) + 1):
        for x in range(int(cx - r), int(cx + r) + 1):
            if (x - cx) ** 2 + (y - cy) ** 2 <= r2:
                px[x, y] = color

def fill_circle_radial(img, cx, cy, r, c1, c2):
    px = img.load()
    r2 = r * r
    for y in range(int(cy - r), int(cy + r) + 1):
        for x in range(int(cx - r), int(cx + r) + 1):
            d2 = (x - cx) ** 2 + (y - cy) ** 2
            if d2 > r2: continue
            t = (d2 ** 0.5) / r
            px[x, y] = lerp_color(c1, c2, t)

def fill_polygon_vgrad(img, points, c1, c2):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).polygon(points, fill=(0, 0, 0, 255))
    px_l, px_i = layer.load(), img.load()
    ys = [p[1] for p in points]
    y0, y1 = min(ys), max(ys)
    h = max(1, y1 - y0)
    w, hh = img.size
    for y in range(hh):
        for x in range(w):
            a = px_l[x, y][3]
            if a == 0: continue
            t = max(0.0, min(1.0, (y - y0) / h))
            color = lerp_color(c1, c2, t)
            alpha = a / 255.0
            base = px_i[x, y]
            px_i[x, y] = tuple(int(base[i] * (1 - alpha) + color[i] * alpha) for i in range(3))

def fill_triangle(img, points, color, outline=None, outline_w=0):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.polygon(points, fill=color, outline=outline)
    px_l, px_i = layer.load(), img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            a = px_l[x, y][3]
            if a == 0: continue
            alpha = a / 255.0
            base = px_i[x, y]
            px_i[x, y] = tuple(int(base[i] * (1 - alpha) + color[i] * alpha) for i in range(3))

# ---------- 主绘图 ----------
def draw_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    s = size / 1024.0

    # 背景：圆角渐变方块（圆角约 22% 半径）
    fill_rounded_gradient(
        img, 0, 0, size - 1, size - 1, int(225 * s),
        BG_TOP, BG_BOT, diagonal=True
    )

    # ---- 布局（1024 坐标系，猫头鹰填满约 80%）----
    # 身体（主椭圆）：cx=512, cy=560, rx=320, ry=360
    # 眼睛：cy=460, 左右各偏 ±150
    # 喙：cy=580
    # 腹部：cy=640
    # 翅膀：cy=620, 侧边
    # 耳簇：cy=200, 顶部

    # 耳簇（左）
    fill_polygon_vgrad(
        img,
        [(int(290 * s), int(200 * s)), (int(255 * s), int(115 * s)),
         (int(335 * s), int(120 * s)), (int(355 * s), int(210 * s))],
        BODY_TOP, BODY_BOT
    )
    # 耳簇（右）
    fill_polygon_vgrad(
        img,
        [(int(734 * s), int(200 * s)), (int(769 * s), int(115 * s)),
         (int(689 * s), int(120 * s)), (int(669 * s), int(210 * s))],
        BODY_TOP, BODY_BOT
    )

    # 身体主椭圆
    fill_ellipse_vgrad(
        img, int(512 * s), int(560 * s), int(320 * s), int(360 * s),
        BODY_TOP, BODY_BOT
    )

    # 翅膀（左）
    fill_polygon_vgrad(
        img,
        [(int(220 * s), int(540 * s)), (int(135 * s), int(620 * s)),
         (int(165 * s), int(770 * s)), (int(245 * s), int(800 * s)),
         (int(290 * s), int(740 * s)), (int(280 * s), int(620 * s))],
        WING, (40, 22, 90)
    )
    # 翅膀（右）
    fill_polygon_vgrad(
        img,
        [(int(804 * s), int(540 * s)), (int(889 * s), int(620 * s)),
         (int(859 * s), int(770 * s)), (int(779 * s), int(800 * s)),
         (int(734 * s), int(740 * s)), (int(744 * s), int(620 * s))],
        WING, (40, 22, 90)
    )

    # 腹部色块
    fill_ellipse_vgrad(
        img, int(512 * s), int(640 * s), int(195 * s), int(235 * s),
        BELLY_TOP, BELLY_BOT
    )

    # 眼眶（深色外圈）
    fill_circle(img, int(388 * s), int(460 * s), int(150 * s), EYE_DARK)
    fill_circle(img, int(636 * s), int(460 * s), int(150 * s), EYE_DARK)

    # 眼白
    fill_circle_radial(img, int(388 * s), int(460 * s), int(120 * s), EYE_LIGHT, EYE_LIGHT2)
    fill_circle_radial(img, int(636 * s), int(460 * s), int(120 * s), EYE_LIGHT, EYE_LIGHT2)

    # 瞳孔
    fill_circle_radial(img, int(398 * s), int(472 * s), int(58 * s), (26, 26, 46), PUPIL)
    fill_circle_radial(img, int(646 * s), int(472 * s), int(58 * s), (26, 26, 46), PUPIL)

    # 眼神高光（大）
    fill_circle(img, int(416 * s), int(456 * s), int(20 * s), (255, 255, 255))
    fill_circle(img, int(664 * s), int(456 * s), int(20 * s), (255, 255, 255))
    # 眼神高光（小）
    fill_circle(img, int(378 * s), int(488 * s), int(10 * s), (255, 255, 255))
    fill_circle(img, int(626 * s), int(488 * s), int(10 * s), (255, 255, 255))

    # 喙（圆角三角）
    fill_triangle(
        img,
        [(int(512 * s), int(550 * s)), (int(460 * s), int(610 * s)),
         (int(564 * s), int(610 * s))],
        BEAK, outline=BEAK_DARK, outline_w=max(1, int(6 * s))
    )

    # 腹部羽毛装饰点
    for (cx, cy) in [(512, 720), (480, 770), (544, 770), (512, 820),
                     (470, 680), (554, 680)]:
        fill_circle(img, int(cx * s), int(cy * s), int(7 * s), FEATHER)

    return img

# ---------- ICNS ----------
def write_icns(entries, out_path):
    chunks = b""
    for typ, data in entries:
        size = 8 + len(data)
        chunks += struct.pack(">4sI", typ, size) + data
    total = 8 + len(chunks)
    with open(out_path, "wb") as f:
        f.write(struct.pack(">4sI", b"icns", total))
        f.write(chunks)

def make_png_bytes(img):
    from io import BytesIO
    buf = BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()

# ---------- 主流程 ----------
def main():
    print("正在生成 1024x1024 PNG 源图...")
    master = draw_icon(1024)
    master.save(os.path.join(OUT_DIR, "icon.png"))

    # Windows ICO
    ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64),
                 (128, 128), (256, 256)]
    ico_imgs = [master.resize(sz, Image.LANCZOS).convert("RGBA") for sz in ico_sizes]
    largest = ico_imgs[-1]
    largest.save(
        os.path.join(OUT_DIR, "icon.ico"),
        format="ICO",
        sizes=ico_sizes,
        append_images=ico_imgs[:-1],
    )

    # Linux PNG
    master.resize((512, 512), Image.LANCZOS).save(
        os.path.join(OUT_DIR, "icon-512.png")
    )

    # macOS ICNS
    icns_entries = [
        (b"ic07", make_png_bytes(master.resize((128, 128), Image.LANCZOS))),
        (b"ic08", make_png_bytes(master.resize((256, 256), Image.LANCZOS))),
        (b"ic09", make_png_bytes(master.resize((512, 512), Image.LANCZOS))),
        (b"ic10", make_png_bytes(master.resize((1024, 1024), Image.LANCZOS))),
        (b"ic11", make_png_bytes(master.resize((32, 32), Image.LANCZOS))),
        (b"ic12", make_png_bytes(master.resize((64, 64), Image.LANCZOS))),
        (b"ic13", make_png_bytes(master.resize((256, 256), Image.LANCZOS))),
        (b"ic14", make_png_bytes(master.resize((512, 512), Image.LANCZOS))),
    ]
    write_icns(icns_entries, os.path.join(OUT_DIR, "icon.icns"))

    print(f"\n所有文件已输出到: {OUT_DIR}")
    for f in sorted(os.listdir(OUT_DIR)):
        full = os.path.join(OUT_DIR, f)
        print(f"  {f}  ({os.path.getsize(full)} bytes)")

    # 同步到 src/renderer/（favicon）
    renderer_dir = os.path.join(os.path.dirname(OUT_DIR), "src", "renderer")
    if os.path.isdir(renderer_dir):
        import shutil
        shutil.copyfile(
            os.path.join(OUT_DIR, "icon.png"),
            os.path.join(renderer_dir, "icon.png"),
        )
        print(f"  已同步: {os.path.join(renderer_dir, 'icon.png')}")

if __name__ == "__main__":
    main()
