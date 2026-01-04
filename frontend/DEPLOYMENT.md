# CourtClock - App Store Deployment Guide

## Prerequisites

1. **Apple Developer Account** ($99/year)
   - Sign up at: https://developer.apple.com/programs/
   
2. **Expo Account** (Free)
   - Sign up at: https://expo.dev/signup

3. **Mac Computer** (Required for iOS builds/submissions)

---

## Step 1: Configure Your App

### Update app.json
The `app.json` file has been configured with:
- App name: "CourtClock"
- Bundle identifier: `com.courtclock.app`
- Required permissions for camera and photo library

**You need to update these placeholders:**
```json
{
  "extra": {
    "eas": {
      "projectId": "your-project-id"  // Get this from Expo dashboard
    }
  },
  "owner": "your-expo-username"  // Your Expo username
}
```

---

## Step 2: Set Up EAS Build

### Install EAS CLI
```bash
npm install -g eas-cli
```

### Login to Expo
```bash
eas login
```

### Link your project
```bash
cd /app/frontend
eas init
```
This will create a project in your Expo dashboard and update the `projectId`.

---

## Step 3: Configure Apple Credentials

### Update eas.json
Edit `/app/frontend/eas.json` and update:
```json
{
  "submit": {
    "production": {
      "ios": {
        "appleId": "your-apple-id@email.com",  // Your Apple ID
        "ascAppId": "your-app-store-connect-app-id",  // From App Store Connect
        "appleTeamId": "YOUR_TEAM_ID"  // Your Apple Team ID
      }
    }
  }
}
```

### Get your Apple Team ID
1. Go to https://developer.apple.com/account
2. Click "Membership" in the sidebar
3. Copy your Team ID

### Create App in App Store Connect
1. Go to https://appstoreconnect.apple.com
2. Click "My Apps" → "+" → "New App"
3. Fill in:
   - Platform: iOS
   - Name: CourtClock
   - Primary Language: English (U.S.)
   - Bundle ID: com.courtclock.app (create this identifier first)
   - SKU: courtclock-001

---

## Step 4: Build Your App

### Build for iOS
```bash
cd /app/frontend
eas build --platform ios --profile production
```

This will:
1. Ask you to log in with your Apple ID
2. Create/select certificates and provisioning profiles
3. Build the app in the cloud
4. Provide a download link when complete

---

## Step 5: Submit to App Store

### Submit via EAS
```bash
eas submit --platform ios --latest
```

Or submit a specific build:
```bash
eas submit --platform ios --id BUILD_ID
```

---

## Step 6: App Store Connect

### Prepare for Review
In App Store Connect, you'll need to provide:

1. **Screenshots** (Required sizes):
   - 6.7" (iPhone 15 Pro Max): 1290 x 2796
   - 6.5" (iPhone 14 Plus): 1284 x 2778
   - 5.5" (iPhone 8 Plus): 1242 x 2208
   - iPad Pro 12.9": 2048 x 2732

2. **App Description**:
```
CourtClock - Your Ultimate Basketball Stat Tracker

Track every moment of the game with CourtClock! Whether you're a coach, parent, or player, capture comprehensive basketball statistics with ease.

Features:
• Real-time stat tracking for points, rebounds, assists, steals, blocks, and more
• Interactive shot charts to visualize shooting performance
• Team Mode for tracking multiple players simultaneously
• AI-powered game summaries
• Live game sharing with friends and family
• PDF export for game reports
• Season statistics and player trends

Perfect for:
- Youth basketball coaches
- AAU team managers
- Basketball parents
- Pickup game enthusiasts

Upgrade to Pro for unlimited games, AI summaries, and advanced features!
```

3. **Keywords**:
```
basketball,stats,tracker,score,keeper,coach,hoops,sports,statistics,shot chart
```

4. **Privacy Policy URL**:
   - You'll need to create and host a privacy policy
   - Example: `https://yourwebsite.com/privacy`

5. **Support URL**:
   - Example: `https://yourwebsite.com/support`

---

## App Assets Checklist

- [ ] App Icon (1024x1024 PNG, no transparency, no rounded corners)
- [ ] iPhone Screenshots (at least 6.5" and 5.5")
- [ ] iPad Screenshots (if supporting tablets)
- [ ] App Preview Video (optional, but recommended)
- [ ] Privacy Policy URL
- [ ] Support URL
- [ ] Marketing URL (optional)

---

## Common Issues

### Certificate Issues
If you have certificate problems:
```bash
eas credentials
```
Select iOS and manage your credentials.

### Build Failures
Check build logs:
```bash
eas build:list
eas build:view BUILD_ID
```

### Rejected by Apple
Common rejection reasons:
1. Incomplete metadata
2. Crashes on launch
3. Broken links
4. Missing privacy policy
5. In-app purchase issues

---

## Backend Deployment

For production, you'll need to deploy your backend separately:

1. **Options**:
   - Railway.app
   - Render.com
   - AWS/GCP/Azure
   - DigitalOcean

2. **Update API URL**:
   After deploying backend, update the frontend environment:
   ```
   EXPO_PUBLIC_BACKEND_URL=https://your-production-api.com
   ```

3. **Configure Stripe**:
   - Get production API keys from Stripe Dashboard
   - Update webhook URL to your production backend

---

## Need Help?

- Expo Documentation: https://docs.expo.dev
- EAS Build Guide: https://docs.expo.dev/build/introduction/
- App Store Guidelines: https://developer.apple.com/app-store/review/guidelines/
