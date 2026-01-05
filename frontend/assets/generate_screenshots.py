from PIL import Image, ImageDraw, ImageFont
import os

os.makedirs('/app/frontend/assets/screenshots', exist_ok=True)

# iPhone 15 Pro Max dimensions (1290 x 2796)
# We'll create at a smaller scale for web display: 430 x 932
WIDTH = 430
HEIGHT = 932

# Colors
DARK_BG = (26, 26, 46)
ORANGE = (255, 107, 53)
WHITE = (255, 255, 255)
GRAY = (156, 163, 175)
CARD_BG = (37, 37, 64)
GREEN = (16, 185, 129)

def draw_rounded_rect(draw, bbox, radius, fill):
    """Draw a rounded rectangle"""
    x1, y1, x2, y2 = bbox
    draw.rectangle([x1 + radius, y1, x2 - radius, y2], fill=fill)
    draw.rectangle([x1, y1 + radius, x2, y2 - radius], fill=fill)
    draw.ellipse([x1, y1, x1 + 2*radius, y1 + 2*radius], fill=fill)
    draw.ellipse([x2 - 2*radius, y1, x2, y1 + 2*radius], fill=fill)
    draw.ellipse([x1, y2 - 2*radius, x1 + 2*radius, y2], fill=fill)
    draw.ellipse([x2 - 2*radius, y2 - 2*radius, x2, y2], fill=fill)

def draw_basketball(draw, cx, cy, radius):
    """Draw a basketball icon"""
    draw.ellipse([cx-radius, cy-radius, cx+radius, cy+radius], fill=ORANGE)
    # Lines
    draw.line([(cx-radius, cy), (cx+radius, cy)], fill=DARK_BG, width=2)
    draw.line([(cx, cy-radius), (cx, cy+radius)], fill=DARK_BG, width=2)

def draw_bottom_nav(draw, height, active_tab=0):
    """Draw bottom navigation bar"""
    nav_y = height - 80
    draw.rectangle([0, nav_y, WIDTH, height], fill=(15, 15, 26))
    
    tabs = ['🏠', '🏀', '👥', '🎮', '📊', '👤']
    labels = ['Home', 'Games', 'Teams', 'Players', 'Stats', 'Profile']
    tab_width = WIDTH // len(tabs)
    
    for i, (icon, label) in enumerate(zip(tabs, labels)):
        x = i * tab_width + tab_width // 2
        color = ORANGE if i == active_tab else GRAY
        # Simple circle for icon placeholder
        draw.ellipse([x-12, nav_y+15, x+12, nav_y+39], fill=color if i == active_tab else (60,60,80))

def create_landing_screen():
    img = Image.new('RGB', (WIDTH, HEIGHT), DARK_BG)
    draw = ImageDraw.Draw(img)
    
    # Basketball logo
    draw_basketball(draw, WIDTH//2, 150, 50)
    
    # Title area
    draw.rectangle([WIDTH//2-100, 230, WIDTH//2+100, 260], fill=WHITE)  # HoopStats text placeholder
    draw.rectangle([WIDTH//2-80, 275, WIDTH//2+80, 295], fill=GRAY)  # Tagline
    
    # Feature list
    features_y = 350
    for i in range(4):
        draw.ellipse([40, features_y + i*45, 60, features_y + i*45 + 20], fill=ORANGE)
        draw.rectangle([75, features_y + i*45 + 5, 300, features_y + i*45 + 15], fill=WHITE)
    
    # Get Started button
    draw_rounded_rect(draw, [30, 580, WIDTH-30, 640], 30, ORANGE)
    
    # Login link
    draw.rectangle([WIDTH//2-80, 680, WIDTH//2+80, 700], fill=ORANGE)
    
    # Subscription plans
    plan_y = 780
    plan_width = 120
    colors = [CARD_BG, ORANGE, CARD_BG]
    for i, color in enumerate(colors):
        x = 25 + i * (plan_width + 15)
        draw_rounded_rect(draw, [x, plan_y, x + plan_width, plan_y + 100], 10, color)
    
    img.save('/app/frontend/assets/screenshots/01_landing.png')
    print("Created: 01_landing.png")

def create_home_screen():
    img = Image.new('RGB', (WIDTH, HEIGHT), DARK_BG)
    draw = ImageDraw.Draw(img)
    
    # Header
    draw.rectangle([0, 0, WIDTH, 60], fill=DARK_BG)
    draw.rectangle([15, 20, 80, 40], fill=WHITE)  # "Home" text
    
    # Welcome section
    draw.rectangle([15, 80, 200, 100], fill=GRAY)  # "Welcome back,"
    draw.rectangle([15, 105, 250, 140], fill=WHITE)  # Username
    draw_rounded_rect(draw, [350, 95, 410, 125], 15, GREEN)  # FREE badge
    
    # New Game button
    draw_rounded_rect(draw, [15, 160, WIDTH-15, 260], 15, ORANGE)
    draw.ellipse([WIDTH//2-20, 185, WIDTH//2+20, 225], fill=WHITE)  # + icon
    
    # Quick Stats
    draw.rectangle([15, 300, 150, 320], fill=WHITE)  # "Quick Stats"
    
    # Stat cards (2x2 grid)
    for row in range(2):
        for col in range(2):
            x = 15 + col * 205
            y = 340 + row * 110
            draw_rounded_rect(draw, [x, y, x + 195, y + 100], 10, CARD_BG)
            draw.ellipse([x+15, y+15, x+35, y+35], fill=ORANGE)
            draw.rectangle([x+15, y+50, x+50, y+80], fill=WHITE)  # Number
    
    # Recent Games
    draw.rectangle([15, 580, 150, 600], fill=WHITE)
    draw.rectangle([350, 580, 410, 600], fill=ORANGE)  # "See All"
    
    # Empty state
    draw_rounded_rect(draw, [15, 620, WIDTH-15, 780], 15, CARD_BG)
    draw_basketball(draw, WIDTH//2, 680, 30)
    draw.rectangle([WIDTH//2-80, 730, WIDTH//2+80, 750], fill=GRAY)
    
    # Upgrade banner
    draw_rounded_rect(draw, [15, 800, WIDTH-15, 850], 10, (50, 40, 60))
    
    draw_bottom_nav(draw, HEIGHT, 0)
    
    img.save('/app/frontend/assets/screenshots/02_home.png')
    print("Created: 02_home.png")

def create_game_tracking_screen():
    img = Image.new('RGB', (WIDTH, HEIGHT), DARK_BG)
    draw = ImageDraw.Draw(img)
    
    # Header with back button and title
    draw.rectangle([15, 20, 45, 40], fill=WHITE)  # Back
    draw.rectangle([WIDTH//2-50, 20, WIDTH//2+50, 45], fill=WHITE)  # "Live Game"
    
    # Score display
    draw_rounded_rect(draw, [15, 70, WIDTH-15, 180], 15, CARD_BG)
    draw.rectangle([50, 100, 150, 150], fill=WHITE)  # Home score
    draw.rectangle([WIDTH//2-20, 115, WIDTH//2+20, 135], fill=GRAY)  # VS
    draw.rectangle([WIDTH-150, 100, WIDTH-50, 150], fill=WHITE)  # Away score
    
    # Timer
    draw_rounded_rect(draw, [WIDTH//2-60, 190, WIDTH//2+60, 230], 20, ORANGE)
    
    # Shot chart (basketball court)
    draw_rounded_rect(draw, [15, 250, WIDTH-15, 450], 10, CARD_BG)
    # Court markings
    draw.rectangle([30, 300, WIDTH-30, 440], outline=GRAY, width=2)
    draw.arc([WIDTH//2-50, 380, WIDTH//2+50, 440], 180, 0, fill=GRAY, width=2)
    draw.ellipse([WIDTH//2-30, 260, WIDTH//2+30, 320], outline=GRAY, width=2)
    # Shot markers
    for pos in [(100, 350), (200, 320), (320, 380), (150, 400)]:
        draw.ellipse([pos[0]-8, pos[1]-8, pos[0]+8, pos[1]+8], fill=GREEN)
    for pos in [(250, 350), (180, 390)]:
        draw.ellipse([pos[0]-8, pos[1]-8, pos[0]+8, pos[1]+8], fill=(239, 68, 68))
    
    # Player stats section
    draw.rectangle([15, 470, 150, 490], fill=WHITE)  # "Player Stats"
    
    # Stat buttons grid
    stats = ['PTS', 'REB', 'AST', 'STL', 'BLK', 'TO']
    for i, stat in enumerate(stats):
        row = i // 3
        col = i % 3
        x = 15 + col * 135
        y = 510 + row * 70
        draw_rounded_rect(draw, [x, y, x + 125, y + 60], 10, CARD_BG)
    
    # Action buttons
    draw_rounded_rect(draw, [15, 670, WIDTH//2-10, 720], 10, GREEN)  # Made
    draw_rounded_rect(draw, [WIDTH//2+10, 670, WIDTH-15, 720], 10, (239, 68, 68))  # Missed
    
    # Player selector
    draw_rounded_rect(draw, [15, 740, WIDTH-15, 850], 15, CARD_BG)
    for i in range(4):
        x = 30 + i * 95
        draw.ellipse([x, 760, x+70, 830], fill=(60, 60, 80))
    
    img.save('/app/frontend/assets/screenshots/03_game_tracking.png')
    print("Created: 03_game_tracking.png")

def create_players_screen():
    img = Image.new('RGB', (WIDTH, HEIGHT), DARK_BG)
    draw = ImageDraw.Draw(img)
    
    # Header
    draw.rectangle([15, 20, 100, 45], fill=WHITE)  # "Players"
    draw_rounded_rect(draw, [WIDTH-100, 15, WIDTH-15, 50], 20, ORANGE)  # Add button
    
    # Search bar
    draw_rounded_rect(draw, [15, 70, WIDTH-15, 120], 25, CARD_BG)
    
    # Player cards
    for i in range(5):
        y = 140 + i * 130
        draw_rounded_rect(draw, [15, y, WIDTH-15, y+120], 15, CARD_BG)
        # Avatar
        draw.ellipse([30, y+20, 100, y+90], fill=ORANGE)
        # Name and details
        draw.rectangle([120, y+25, 280, y+50], fill=WHITE)
        draw.rectangle([120, y+60, 200, y+80], fill=GRAY)
        # Stats
        draw.rectangle([300, y+30, 400, y+50], fill=GRAY)
        draw.rectangle([300, y+60, 380, y+80], fill=GRAY)
    
    draw_bottom_nav(draw, HEIGHT, 3)
    
    img.save('/app/frontend/assets/screenshots/04_players.png')
    print("Created: 04_players.png")

def create_teams_screen():
    img = Image.new('RGB', (WIDTH, HEIGHT), DARK_BG)
    draw = ImageDraw.Draw(img)
    
    # Header
    draw.rectangle([15, 20, 100, 45], fill=WHITE)  # "Teams"
    draw_rounded_rect(draw, [WIDTH-100, 15, WIDTH-15, 50], 20, ORANGE)  # Add button
    
    # Team cards
    for i in range(3):
        y = 80 + i * 200
        draw_rounded_rect(draw, [15, y, WIDTH-15, y+180], 15, CARD_BG)
        # Team icon
        draw.ellipse([30, y+20, 110, y+100], fill=ORANGE)
        draw_basketball(draw, 70, y+60, 25)
        # Team name
        draw.rectangle([130, y+30, 300, y+60], fill=WHITE)
        # Player count
        draw.rectangle([130, y+75, 250, y+95], fill=GRAY)
        # Stats row
        for j in range(3):
            x = 30 + j * 130
            draw_rounded_rect(draw, [x, y+120, x+110, y+160], 8, (50, 50, 70))
    
    draw_bottom_nav(draw, HEIGHT, 2)
    
    img.save('/app/frontend/assets/screenshots/05_teams.png')
    print("Created: 05_teams.png")

def create_game_summary_screen():
    img = Image.new('RGB', (WIDTH, HEIGHT), DARK_BG)
    draw = ImageDraw.Draw(img)
    
    # Header
    draw.rectangle([15, 20, 45, 40], fill=WHITE)  # Back
    draw.rectangle([WIDTH//2-70, 20, WIDTH//2+70, 45], fill=WHITE)  # "Game Summary"
    draw_rounded_rect(draw, [WIDTH-80, 15, WIDTH-15, 50], 15, ORANGE)  # Share
    
    # Final Score
    draw_rounded_rect(draw, [15, 70, WIDTH-15, 170], 15, CARD_BG)
    draw.rectangle([WIDTH//2-100, 85, WIDTH//2-20, 150], fill=WHITE)  # Home score
    draw.rectangle([WIDTH//2-10, 110, WIDTH//2+10, 130], fill=GRAY)  # -
    draw.rectangle([WIDTH//2+20, 85, WIDTH//2+100, 150], fill=WHITE)  # Away score
    
    # AI Summary
    draw.rectangle([15, 190, 130, 210], fill=WHITE)  # "AI Summary"
    draw_rounded_rect(draw, [15, 220, WIDTH-15, 380], 15, CARD_BG)
    for i in range(5):
        draw.rectangle([30, 240 + i*25, WIDTH-45, 255 + i*25], fill=GRAY)
    
    # Stats Table
    draw.rectangle([15, 400, 130, 420], fill=WHITE)  # "Player Stats"
    
    # Period filter
    for i, label in enumerate(['H1', 'H2', 'All']):
        x = 250 + i * 55
        color = ORANGE if i == 2 else CARD_BG
        draw_rounded_rect(draw, [x, 395, x+50, 425], 15, color)
    
    # Stats header
    draw_rounded_rect(draw, [15, 440, WIDTH-15, 480], 10, (40, 40, 60))
    
    # Player stats rows
    for i in range(4):
        y = 490 + i * 60
        bg = CARD_BG if i % 2 == 0 else (45, 45, 70)
        draw_rounded_rect(draw, [15, y, WIDTH-15, y+55], 8, bg)
        draw.ellipse([25, y+10, 60, y+45], fill=ORANGE)  # Avatar
    
    # Export button
    draw_rounded_rect(draw, [15, 740, WIDTH-15, 800], 25, ORANGE)
    
    draw_bottom_nav(draw, HEIGHT, 1)
    
    img.save('/app/frontend/assets/screenshots/06_game_summary.png')
    print("Created: 06_game_summary.png")

def create_profile_screen():
    img = Image.new('RGB', (WIDTH, HEIGHT), DARK_BG)
    draw = ImageDraw.Draw(img)
    
    # Header
    draw.rectangle([15, 20, 100, 45], fill=WHITE)  # "Profile"
    
    # Avatar section
    draw.ellipse([WIDTH//2-50, 80, WIDTH//2+50, 180], fill=ORANGE)
    draw.rectangle([WIDTH//2-60, 195, WIDTH//2+60, 220], fill=WHITE)  # Name
    draw.rectangle([WIDTH//2-80, 230, WIDTH//2+80, 250], fill=GRAY)  # Email
    
    # Subscription card
    draw_rounded_rect(draw, [15, 280, WIDTH-15, 400], 15, CARD_BG)
    draw_rounded_rect(draw, [30, 295, 100, 325], 10, GREEN)  # PRO badge
    draw.rectangle([30, 340, 200, 360], fill=WHITE)  # Plan name
    draw.rectangle([30, 370, 250, 385], fill=GRAY)  # Details
    draw_rounded_rect(draw, [WIDTH-130, 330, WIDTH-30, 375], 20, ORANGE)  # Manage
    
    # Settings options
    options_y = 430
    for i in range(5):
        y = options_y + i * 65
        draw_rounded_rect(draw, [15, y, WIDTH-15, y+55], 10, CARD_BG)
        draw.ellipse([30, y+12, 60, y+42], fill=(60, 60, 80))
        draw.rectangle([80, y+20, 250, y+38], fill=WHITE)
    
    # Logout button
    draw_rounded_rect(draw, [15, 770, WIDTH-15, 830], 25, (80, 30, 30))
    
    draw_bottom_nav(draw, HEIGHT, 5)
    
    img.save('/app/frontend/assets/screenshots/07_profile.png')
    print("Created: 07_profile.png")

def create_subscription_screen():
    img = Image.new('RGB', (WIDTH, HEIGHT), DARK_BG)
    draw = ImageDraw.Draw(img)
    
    # Header
    draw.rectangle([15, 20, 45, 40], fill=WHITE)  # Back
    draw.rectangle([WIDTH//2-80, 20, WIDTH//2+80, 45], fill=WHITE)  # "Choose Plan"
    
    # Toggle Monthly/Yearly
    draw_rounded_rect(draw, [WIDTH//2-100, 70, WIDTH//2+100, 110], 20, CARD_BG)
    draw_rounded_rect(draw, [WIDTH//2-95, 75, WIDTH//2, 105], 18, ORANGE)  # Active
    
    # Plan cards
    plans = [
        ('Free', '$0', CARD_BG),
        ('Pro', '$6.99/mo', ORANGE),
        ('Team', '$19.99/mo', CARD_BG)
    ]
    
    for i, (name, price, color) in enumerate(plans):
        y = 140 + i * 230
        draw_rounded_rect(draw, [15, y, WIDTH-15, y+210], 15, color)
        # Plan name
        draw.rectangle([30, y+20, 150, y+50], fill=WHITE if color == ORANGE else WHITE)
        # Price
        draw.rectangle([30, y+60, 180, y+100], fill=WHITE)
        # Features
        for j in range(3):
            draw.ellipse([30, y+115+j*25, 50, y+135+j*25], fill=GREEN)
            draw.rectangle([60, y+120+j*25, 250, y+135+j*25], fill=GRAY)
    
    img.save('/app/frontend/assets/screenshots/08_subscription.png')
    print("Created: 08_subscription.png")

def create_new_game_screen():
    img = Image.new('RGB', (WIDTH, HEIGHT), DARK_BG)
    draw = ImageDraw.Draw(img)
    
    # Header
    draw.rectangle([15, 20, 45, 40], fill=WHITE)  # Back
    draw.rectangle([WIDTH//2-60, 20, WIDTH//2+60, 45], fill=WHITE)  # "New Game"
    
    # Game Mode toggle
    draw.rectangle([15, 70, 120, 90], fill=WHITE)  # "Game Mode"
    draw_rounded_rect(draw, [15, 100, WIDTH-15, 150], 25, CARD_BG)
    draw_rounded_rect(draw, [20, 105, WIDTH//2-5, 145], 20, ORANGE)  # Individual
    
    # Team selection
    draw.rectangle([15, 175, 120, 195], fill=WHITE)  # "Your Team"
    draw_rounded_rect(draw, [15, 205, WIDTH-15, 280], 15, CARD_BG)
    draw.ellipse([30, 220, 90, 265], fill=ORANGE)
    draw.rectangle([110, 235, 280, 255], fill=WHITE)
    
    # Opponent
    draw.rectangle([15, 305, 100, 325], fill=WHITE)  # "Opponent"
    draw_rounded_rect(draw, [15, 335, WIDTH-15, 395], 15, CARD_BG)
    
    # Select Players
    draw.rectangle([15, 420, 150, 440], fill=WHITE)  # "Select Players"
    
    # Player grid
    for row in range(2):
        for col in range(3):
            x = 15 + col * 135
            y = 460 + row * 120
            draw_rounded_rect(draw, [x, y, x+125, y+110], 10, CARD_BG)
            draw.ellipse([x+35, y+15, x+90, y+70], fill=ORANGE)
            draw.rectangle([x+20, y+80, x+105, y+100], fill=GRAY)
    
    # Start Game button
    draw_rounded_rect(draw, [15, 720, WIDTH-15, 790], 30, GREEN)
    
    draw_bottom_nav(draw, HEIGHT, 1)
    
    img.save('/app/frontend/assets/screenshots/09_new_game.png')
    print("Created: 09_new_game.png")

def create_live_share_screen():
    img = Image.new('RGB', (WIDTH, HEIGHT), DARK_BG)
    draw = ImageDraw.Draw(img)
    
    # Header with LIVE badge
    draw_rounded_rect(draw, [15, 15, 70, 45], 10, (239, 68, 68))  # LIVE
    draw.rectangle([WIDTH//2-70, 20, WIDTH//2+70, 45], fill=WHITE)  # "Live Game"
    
    # Score
    draw_rounded_rect(draw, [15, 70, WIDTH-15, 180], 15, CARD_BG)
    draw.rectangle([50, 90, 100, 160], fill=WHITE)  # Home score big
    draw.rectangle([WIDTH-100, 90, WIDTH-50, 160], fill=WHITE)  # Away score
    draw.rectangle([WIDTH//2-30, 115, WIDTH//2+30, 140], fill=GRAY)  # Quarter
    
    # Timer
    draw_rounded_rect(draw, [WIDTH//2-50, 190, WIDTH//2+50, 230], 15, ORANGE)
    
    # Live Stats
    draw.rectangle([15, 250, 120, 270], fill=WHITE)  # "Live Stats"
    
    # Stats comparison
    draw_rounded_rect(draw, [15, 290, WIDTH-15, 500], 15, CARD_BG)
    stats_labels = ['Points', 'Rebounds', 'Assists', 'Steals']
    for i, label in enumerate(stats_labels):
        y = 310 + i * 45
        draw.rectangle([30, y, 100, y+15], fill=GRAY)  # Label
        draw.rectangle([30, y+20, 80, y+35], fill=WHITE)  # Home stat
        draw.rectangle([WIDTH-80, y+20, WIDTH-30, y+35], fill=WHITE)  # Away stat
        # Progress bar
        draw.rectangle([110, y+25, WIDTH-110, y+30], fill=(50, 50, 70))
        draw.rectangle([110, y+25, 200, y+30], fill=ORANGE)
    
    # On Court / Bench
    draw.rectangle([15, 530, 100, 550], fill=WHITE)  # "On Court"
    draw_rounded_rect(draw, [15, 560, WIDTH-15, 700], 15, CARD_BG)
    for i in range(5):
        x = 25 + i * 78
        draw.ellipse([x, 580, x+65, 645], fill=ORANGE)
        draw.rectangle([x+5, 655, x+60, 670], fill=GRAY)
    
    # Share info
    draw_rounded_rect(draw, [15, 720, WIDTH-15, 800], 15, CARD_BG)
    draw.ellipse([30, 740, 70, 780], fill=GREEN)  # QR placeholder
    draw.rectangle([90, 750, 300, 770], fill=GRAY)
    
    img.save('/app/frontend/assets/screenshots/10_live_share.png')
    print("Created: 10_live_share.png")

# Generate all screenshots
print("Generating App Screenshots...")
print("="*40)

create_landing_screen()
create_home_screen()
create_game_tracking_screen()
create_players_screen()
create_teams_screen()
create_game_summary_screen()
create_profile_screen()
create_subscription_screen()
create_new_game_screen()
create_live_share_screen()

print("="*40)
print("✅ All 10 screenshots generated!")
print("Screenshots are in: /app/frontend/assets/screenshots/")
