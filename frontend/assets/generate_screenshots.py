from PIL import Image, ImageDraw
import os

os.makedirs('/app/frontend/assets/screenshots', exist_ok=True)

WIDTH = 430
HEIGHT = 932

DARK_BG = (26, 26, 46)
ORANGE = (255, 107, 53)
WHITE = (255, 255, 255)
GRAY = (156, 163, 175)
CARD_BG = (37, 37, 64)
GREEN = (16, 185, 129)
RED = (239, 68, 68)

def draw_rounded_rect(draw, bbox, radius, fill):
    x1, y1, x2, y2 = bbox
    if radius > (y2 - y1) / 2:
        radius = (y2 - y1) // 2
    if radius > (x2 - x1) / 2:
        radius = (x2 - x1) // 2
    if radius < 1:
        radius = 1
    draw.rectangle([x1 + radius, y1, x2 - radius, y2], fill=fill)
    draw.rectangle([x1, y1 + radius, x2, y2 - radius], fill=fill)
    draw.ellipse([x1, y1, x1 + 2*radius, y1 + 2*radius], fill=fill)
    draw.ellipse([x2 - 2*radius, y1, x2, y1 + 2*radius], fill=fill)
    draw.ellipse([x1, y2 - 2*radius, x1 + 2*radius, y2], fill=fill)
    draw.ellipse([x2 - 2*radius, y2 - 2*radius, x2, y2], fill=fill)

def draw_basketball(draw, cx, cy, radius):
    draw.ellipse([cx-radius, cy-radius, cx+radius, cy+radius], fill=ORANGE)
    draw.line([(cx-radius, cy), (cx+radius, cy)], fill=DARK_BG, width=2)
    draw.line([(cx, cy-radius), (cx, cy+radius)], fill=DARK_BG, width=2)

def draw_bottom_nav(draw, active=0):
    nav_y = HEIGHT - 70
    draw.rectangle([0, nav_y, WIDTH, HEIGHT], fill=(15, 15, 26))
    tabs = 5
    tab_w = WIDTH // tabs
    for i in range(tabs):
        x = i * tab_w + tab_w // 2
        color = ORANGE if i == active else (60, 60, 80)
        draw.ellipse([x-15, nav_y+15, x+15, nav_y+45], fill=color)
        draw.rectangle([x-20, nav_y+50, x+20, nav_y+62], fill=GRAY if i != active else ORANGE)

def create_landing():
    img = Image.new('RGB', (WIDTH, HEIGHT), DARK_BG)
    draw = ImageDraw.Draw(img)
    draw_basketball(draw, WIDTH//2, 130, 45)
    draw.rectangle([WIDTH//2-90, 200, WIDTH//2+90, 235], fill=WHITE)
    draw.rectangle([WIDTH//2-70, 250, WIDTH//2+70, 270], fill=GRAY)
    for i in range(4):
        draw.ellipse([40, 320+i*40, 58, 338+i*40], fill=ORANGE)
        draw.rectangle([70, 323+i*40, 280, 335+i*40], fill=WHITE)
    draw_rounded_rect(draw, [30, 530, WIDTH-30, 590], 30, ORANGE)
    draw.rectangle([WIDTH//2-100, 630, WIDTH//2+100, 650], fill=ORANGE)
    draw.rectangle([WIDTH//2-70, 710, WIDTH//2+70, 730], fill=GRAY)
    for i in range(3):
        x = 30 + i * 130
        c = ORANGE if i == 1 else CARD_BG
        draw_rounded_rect(draw, [x, 770, x+115, 880], 12, c)
    img.save('/app/frontend/assets/screenshots/01_landing.png')
    print("Created: 01_landing.png")

def create_home():
    img = Image.new('RGB', (WIDTH, HEIGHT), DARK_BG)
    draw = ImageDraw.Draw(img)
    draw.rectangle([15, 25, 70, 45], fill=WHITE)
    draw.rectangle([15, 75, 130, 93], fill=GRAY)
    draw.rectangle([15, 100, 200, 130], fill=WHITE)
    draw_rounded_rect(draw, [330, 100, 400, 130], 15, GREEN)
    draw_rounded_rect(draw, [15, 155, WIDTH-15, 250], 15, ORANGE)
    draw.ellipse([WIDTH//2-18, 178, WIDTH//2+18, 214], fill=WHITE)
    draw.rectangle([15, 280, 110, 300], fill=WHITE)
    for r in range(2):
        for c in range(2):
            x, y = 15 + c*205, 320 + r*100
            draw_rounded_rect(draw, [x, y, x+195, y+90], 10, CARD_BG)
            draw.ellipse([x+12, y+12, x+35, y+35], fill=ORANGE)
            draw.rectangle([x+12, y+50, x+60, y+75], fill=WHITE)
    draw.rectangle([15, 540, 120, 560], fill=WHITE)
    draw.rectangle([350, 540, 400, 560], fill=ORANGE)
    draw_rounded_rect(draw, [15, 580, WIDTH-15, 720], 15, CARD_BG)
    draw_basketball(draw, WIDTH//2, 630, 25)
    draw.rectangle([WIDTH//2-70, 680, WIDTH//2+70, 700], fill=GRAY)
    draw_rounded_rect(draw, [15, 750, WIDTH-15, 800], 10, (50, 40, 60))
    draw_bottom_nav(draw, 0)
    img.save('/app/frontend/assets/screenshots/02_home.png')
    print("Created: 02_home.png")

def create_game_tracking():
    img = Image.new('RGB', (WIDTH, HEIGHT), DARK_BG)
    draw = ImageDraw.Draw(img)
    draw.rectangle([15, 25, 40, 45], fill=WHITE)
    draw.rectangle([WIDTH//2-45, 25, WIDTH//2+45, 48], fill=WHITE)
    draw_rounded_rect(draw, [15, 65, WIDTH-15, 155], 15, CARD_BG)
    draw.rectangle([45, 85, 120, 135], fill=WHITE)
    draw.rectangle([WIDTH//2-15, 105, WIDTH//2+15, 120], fill=GRAY)
    draw.rectangle([WIDTH-120, 85, WIDTH-45, 135], fill=WHITE)
    draw_rounded_rect(draw, [WIDTH//2-55, 165, WIDTH//2+55, 200], 18, ORANGE)
    draw_rounded_rect(draw, [15, 220, WIDTH-15, 400], 10, CARD_BG)
    draw.rectangle([25, 250, WIDTH-25, 390], outline=GRAY, width=2)
    draw.arc([WIDTH//2-45, 340, WIDTH//2+45, 390], 180, 0, fill=GRAY, width=2)
    for p in [(90, 310), (190, 280), (300, 340), (140, 360)]:
        draw.ellipse([p[0]-7, p[1]-7, p[0]+7, p[1]+7], fill=GREEN)
    for p in [(240, 320), (170, 355)]:
        draw.ellipse([p[0]-7, p[1]-7, p[0]+7, p[1]+7], fill=RED)
    draw.rectangle([15, 420, 110, 440], fill=WHITE)
    for i in range(6):
        r, c = i // 3, i % 3
        x, y = 15 + c*137, 460 + r*65
        draw_rounded_rect(draw, [x, y, x+127, y+55], 10, CARD_BG)
    draw_rounded_rect(draw, [15, 605, WIDTH//2-10, 655], 10, GREEN)
    draw_rounded_rect(draw, [WIDTH//2+10, 605, WIDTH-15, 655], 10, RED)
    draw_rounded_rect(draw, [15, 680, WIDTH-15, 780], 15, CARD_BG)
    for i in range(4):
        x = 28 + i * 98
        draw.ellipse([x, 695, x+75, 770], fill=(60, 60, 80))
    draw.rectangle([350, 25, 410, 48], fill=ORANGE)
    img.save('/app/frontend/assets/screenshots/03_game_tracking.png')
    print("Created: 03_game_tracking.png")

def create_players():
    img = Image.new('RGB', (WIDTH, HEIGHT), DARK_BG)
    draw = ImageDraw.Draw(img)
    draw.rectangle([15, 25, 90, 48], fill=WHITE)
    draw_rounded_rect(draw, [WIDTH-90, 20, WIDTH-15, 55], 18, ORANGE)
    draw_rounded_rect(draw, [15, 75, WIDTH-15, 120], 25, CARD_BG)
    for i in range(5):
        y = 145 + i * 115
        draw_rounded_rect(draw, [15, y, WIDTH-15, y+105], 15, CARD_BG)
        draw.ellipse([28, y+18, 90, y+80], fill=ORANGE)
        draw.rectangle([110, y+25, 260, y+48], fill=WHITE)
        draw.rectangle([110, y+58, 190, y+75], fill=GRAY)
        draw.rectangle([300, y+30, 390, y+48], fill=GRAY)
        draw.rectangle([300, y+58, 370, y+75], fill=GRAY)
    draw_bottom_nav(draw, 3)
    img.save('/app/frontend/assets/screenshots/04_players.png')
    print("Created: 04_players.png")

def create_teams():
    img = Image.new('RGB', (WIDTH, HEIGHT), DARK_BG)
    draw = ImageDraw.Draw(img)
    draw.rectangle([15, 25, 80, 48], fill=WHITE)
    draw_rounded_rect(draw, [WIDTH-90, 20, WIDTH-15, 55], 18, ORANGE)
    for i in range(3):
        y = 80 + i * 185
        draw_rounded_rect(draw, [15, y, WIDTH-15, y+170], 15, CARD_BG)
        draw.ellipse([28, y+18, 100, y+90], fill=ORANGE)
        draw_basketball(draw, 64, y+54, 22)
        draw.rectangle([120, y+30, 280, y+58], fill=WHITE)
        draw.rectangle([120, y+70, 240, y+88], fill=GRAY)
        for j in range(3):
            x = 28 + j * 130
            draw_rounded_rect(draw, [x, y+110, x+115, y+150], 8, (50, 50, 70))
    draw_bottom_nav(draw, 2)
    img.save('/app/frontend/assets/screenshots/05_teams.png')
    print("Created: 05_teams.png")

def create_game_summary():
    img = Image.new('RGB', (WIDTH, HEIGHT), DARK_BG)
    draw = ImageDraw.Draw(img)
    draw.rectangle([15, 25, 40, 45], fill=WHITE)
    draw.rectangle([WIDTH//2-65, 25, WIDTH//2+65, 48], fill=WHITE)
    draw_rounded_rect(draw, [WIDTH-75, 20, WIDTH-15, 55], 15, ORANGE)
    draw_rounded_rect(draw, [15, 70, WIDTH-15, 160], 15, CARD_BG)
    draw.rectangle([WIDTH//2-85, 85, WIDTH//2-15, 140], fill=WHITE)
    draw.rectangle([WIDTH//2-8, 105, WIDTH//2+8, 120], fill=GRAY)
    draw.rectangle([WIDTH//2+15, 85, WIDTH//2+85, 140], fill=WHITE)
    draw.rectangle([15, 180, 115, 200], fill=WHITE)
    draw_rounded_rect(draw, [15, 215, WIDTH-15, 360], 15, CARD_BG)
    for i in range(5):
        draw.rectangle([28, 235 + i*23, WIDTH-45, 248 + i*23], fill=GRAY)
    draw.rectangle([15, 385, 120, 405], fill=WHITE)
    for i, lbl in enumerate(['H1', 'H2', 'All']):
        x = 260 + i * 55
        c = ORANGE if i == 2 else CARD_BG
        draw_rounded_rect(draw, [x, 380, x+48, 410], 12, c)
    draw_rounded_rect(draw, [15, 430, WIDTH-15, 465], 8, (40, 40, 60))
    for i in range(4):
        y = 475 + i * 55
        bg = CARD_BG if i % 2 == 0 else (45, 45, 70)
        draw_rounded_rect(draw, [15, y, WIDTH-15, y+50], 8, bg)
        draw.ellipse([22, y+8, 55, y+42], fill=ORANGE)
    draw_rounded_rect(draw, [15, 710, WIDTH-15, 770], 25, ORANGE)
    draw_bottom_nav(draw, 1)
    img.save('/app/frontend/assets/screenshots/06_game_summary.png')
    print("Created: 06_game_summary.png")

def create_profile():
    img = Image.new('RGB', (WIDTH, HEIGHT), DARK_BG)
    draw = ImageDraw.Draw(img)
    draw.rectangle([15, 25, 85, 48], fill=WHITE)
    draw.ellipse([WIDTH//2-45, 80, WIDTH//2+45, 170], fill=ORANGE)
    draw.rectangle([WIDTH//2-55, 185, WIDTH//2+55, 208], fill=WHITE)
    draw.rectangle([WIDTH//2-75, 220, WIDTH//2+75, 238], fill=GRAY)
    draw_rounded_rect(draw, [15, 265, WIDTH-15, 375], 15, CARD_BG)
    draw_rounded_rect(draw, [28, 280, 90, 308], 10, GREEN)
    draw.rectangle([28, 325, 190, 348], fill=WHITE)
    draw.rectangle([28, 355, 240, 370], fill=GRAY)
    draw_rounded_rect(draw, [WIDTH-125, 315, WIDTH-28, 358], 20, ORANGE)
    for i in range(5):
        y = 400 + i * 62
        draw_rounded_rect(draw, [15, y, WIDTH-15, y+52], 10, CARD_BG)
        draw.ellipse([28, y+10, 58, y+40], fill=(60, 60, 80))
        draw.rectangle([75, y+18, 230, y+35], fill=WHITE)
    draw_rounded_rect(draw, [15, 720, WIDTH-15, 775], 25, (80, 30, 30))
    draw_bottom_nav(draw, 4)
    img.save('/app/frontend/assets/screenshots/07_profile.png')
    print("Created: 07_profile.png")

def create_subscription():
    img = Image.new('RGB', (WIDTH, HEIGHT), DARK_BG)
    draw = ImageDraw.Draw(img)
    draw.rectangle([15, 25, 40, 45], fill=WHITE)
    draw.rectangle([WIDTH//2-70, 25, WIDTH//2+70, 48], fill=WHITE)
    draw_rounded_rect(draw, [WIDTH//2-95, 70, WIDTH//2+95, 108], 19, CARD_BG)
    draw_rounded_rect(draw, [WIDTH//2-92, 73, WIDTH//2, 105], 17, ORANGE)
    plans = [(CARD_BG, '$0'), (ORANGE, '$6.99'), (CARD_BG, '$19.99')]
    for i, (c, p) in enumerate(plans):
        y = 135 + i * 215
        draw_rounded_rect(draw, [15, y, WIDTH-15, y+200], 15, c)
        draw.rectangle([28, y+18, 130, y+45], fill=WHITE)
        draw.rectangle([28, y+55, 170, y+90], fill=WHITE)
        for j in range(3):
            draw.ellipse([28, y+108+j*25, 48, y+128+j*25], fill=GREEN)
            draw.rectangle([58, y+113+j*25, 240, y+126+j*25], fill=GRAY)
    img.save('/app/frontend/assets/screenshots/08_subscription.png')
    print("Created: 08_subscription.png")

def create_new_game():
    img = Image.new('RGB', (WIDTH, HEIGHT), DARK_BG)
    draw = ImageDraw.Draw(img)
    draw.rectangle([15, 25, 40, 45], fill=WHITE)
    draw.rectangle([WIDTH//2-55, 25, WIDTH//2+55, 48], fill=WHITE)
    draw.rectangle([15, 75, 105, 95], fill=WHITE)
    draw_rounded_rect(draw, [15, 105, WIDTH-15, 150], 23, CARD_BG)
    draw_rounded_rect(draw, [20, 110, WIDTH//2-5, 145], 20, ORANGE)
    draw.rectangle([15, 175, 105, 195], fill=WHITE)
    draw_rounded_rect(draw, [15, 205, WIDTH-15, 275], 15, CARD_BG)
    draw.ellipse([28, 218, 85, 262], fill=ORANGE)
    draw.rectangle([105, 233, 260, 255], fill=WHITE)
    draw.rectangle([15, 300, 95, 320], fill=WHITE)
    draw_rounded_rect(draw, [15, 330, WIDTH-15, 385], 15, CARD_BG)
    draw.rectangle([15, 410, 135, 430], fill=WHITE)
    for r in range(2):
        for c in range(3):
            x, y = 15 + c * 137, 450 + r * 115
            draw_rounded_rect(draw, [x, y, x+127, y+105], 10, CARD_BG)
            draw.ellipse([x+33, y+12, x+95, y+65], fill=ORANGE)
            draw.rectangle([x+18, y+75, x+108, y+93], fill=GRAY)
    draw_rounded_rect(draw, [15, 700, WIDTH-15, 765], 30, GREEN)
    draw_bottom_nav(draw, 1)
    img.save('/app/frontend/assets/screenshots/09_new_game.png')
    print("Created: 09_new_game.png")

def create_live_share():
    img = Image.new('RGB', (WIDTH, HEIGHT), DARK_BG)
    draw = ImageDraw.Draw(img)
    draw_rounded_rect(draw, [15, 20, 65, 48], 10, RED)
    draw.rectangle([WIDTH//2-60, 25, WIDTH//2+60, 48], fill=WHITE)
    draw_rounded_rect(draw, [15, 70, WIDTH-15, 170], 15, CARD_BG)
    draw.rectangle([45, 88, 105, 150], fill=WHITE)
    draw.rectangle([WIDTH-105, 88, WIDTH-45, 150], fill=WHITE)
    draw.rectangle([WIDTH//2-28, 108, WIDTH//2+28, 128], fill=GRAY)
    draw_rounded_rect(draw, [WIDTH//2-48, 180, WIDTH//2+48, 215], 15, ORANGE)
    draw.rectangle([15, 235, 110, 255], fill=WHITE)
    draw_rounded_rect(draw, [15, 275, WIDTH-15, 470], 15, CARD_BG)
    for i in range(4):
        y = 295 + i * 42
        draw.rectangle([28, y, 95, y+12], fill=GRAY)
        draw.rectangle([28, y+18, 75, y+30], fill=WHITE)
        draw.rectangle([WIDTH-75, y+18, WIDTH-28, y+30], fill=WHITE)
        draw.rectangle([105, y+22, WIDTH-105, y+26], fill=(50, 50, 70))
        draw.rectangle([105, y+22, 195, y+26], fill=ORANGE)
    draw.rectangle([15, 500, 90, 520], fill=WHITE)
    draw_rounded_rect(draw, [15, 535, WIDTH-15, 670], 15, CARD_BG)
    for i in range(5):
        x = 23 + i * 80
        draw.ellipse([x, 550, x+65, 615], fill=ORANGE)
        draw.rectangle([x+5, 625, x+60, 640], fill=GRAY)
    draw_rounded_rect(draw, [15, 695, WIDTH-15, 770], 15, CARD_BG)
    draw.ellipse([28, 712, 68, 752], fill=GREEN)
    draw.rectangle([85, 725, 280, 742], fill=GRAY)
    img.save('/app/frontend/assets/screenshots/10_live_share.png')
    print("Created: 10_live_share.png")

print("Generating App Screenshots...")
print("="*40)
create_landing()
create_home()
create_game_tracking()
create_players()
create_teams()
create_game_summary()
create_profile()
create_subscription()
create_new_game()
create_live_share()
print("="*40)
print("✅ All 10 screenshots generated!")
