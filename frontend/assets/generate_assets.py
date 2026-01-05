from PIL import Image, ImageDraw, ImageFont
import os

# Create directories
os.makedirs('/app/frontend/assets/screenshots', exist_ok=True)
os.makedirs('/app/frontend/assets/icons', exist_ok=True)

# Colors
DARK_BG = (26, 26, 46)
ORANGE = (255, 107, 53)
WHITE = (255, 255, 255)
GRAY = (156, 163, 175)
CARD_BG = (37, 37, 64)

def create_app_icon(size, filename):
    """Create app icon with basketball design"""
    img = Image.new('RGB', (size, size), DARK_BG)
    draw = ImageDraw.Draw(img)
    
    # Draw circle background
    padding = size // 8
    circle_bbox = [padding, padding, size - padding, size - padding]
    draw.ellipse(circle_bbox, fill=(40, 40, 60))
    
    # Draw basketball
    center = size // 2
    ball_radius = size // 3
    ball_bbox = [center - ball_radius, center - ball_radius, 
                 center + ball_radius, center + ball_radius]
    draw.ellipse(ball_bbox, fill=ORANGE)
    
    # Draw basketball lines
    line_width = max(2, size // 100)
    # Horizontal line
    draw.line([(center - ball_radius, center), (center + ball_radius, center)], 
              fill=DARK_BG, width=line_width)
    # Vertical line
    draw.line([(center, center - ball_radius), (center, center + ball_radius)], 
              fill=DARK_BG, width=line_width)
    # Curved lines (simplified as arcs)
    arc_offset = ball_radius // 2
    draw.arc([center - ball_radius - arc_offset, center - ball_radius,
              center + arc_offset, center + ball_radius], 
             start=270, end=90, fill=DARK_BG, width=line_width)
    draw.arc([center - arc_offset, center - ball_radius,
              center + ball_radius + arc_offset, center + ball_radius], 
             start=90, end=270, fill=DARK_BG, width=line_width)
    
    img.save(filename, 'PNG')
    print(f"Created: {filename}")

# Generate app icons
create_app_icon(1024, '/app/frontend/assets/icons/app-icon-1024.png')
create_app_icon(512, '/app/frontend/assets/icons/app-icon-512.png')
create_app_icon(180, '/app/frontend/assets/icons/app-icon-180.png')

# Copy to main icon location
img_1024 = Image.open('/app/frontend/assets/icons/app-icon-1024.png')
img_1024.save('/app/frontend/assets/images/icon.png')
img_1024.save('/app/frontend/assets/images/adaptive-icon.png')
print("Updated main icons")

print("\n✅ All icons generated successfully!")
print("Icons are in: /app/frontend/assets/icons/")
