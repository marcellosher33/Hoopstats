# RevenueCat In-App Purchase Setup Guide

## Overview
This app uses RevenueCat to manage in-app subscriptions for iOS and Android. RevenueCat provides a unified API for handling subscriptions across both platforms.

## Step 1: Create RevenueCat Account

1. Go to [RevenueCat Dashboard](https://app.revenuecat.com)
2. Sign up for a free account
3. Create a new project for "HoopStats" (or your app name)

## Step 2: Configure iOS App (App Store Connect)

### 2.1 Create App in App Store Connect
1. Log in to [App Store Connect](https://appstoreconnect.apple.com)
2. Go to "My Apps" → Create a new app (if not already created)
3. Note your **Bundle ID** (e.g., `com.yourcompany.hoopstats`)

### 2.2 Create In-App Purchase Products
1. In App Store Connect, go to your app → "In-App Purchases"
2. Click "+" to create new subscriptions
3. Create the following products:

| Product ID | Type | Price | Description |
|------------|------|-------|-------------|
| `pro_monthly` | Auto-Renewable Subscription | $6.99/month | Pro Monthly |
| `pro_yearly` | Auto-Renewable Subscription | $69.99/year | Pro Yearly |
| `team_monthly` | Auto-Renewable Subscription | $19.99/month | Team Monthly |
| `team_yearly` | Auto-Renewable Subscription | $199.99/year | Team Yearly |

4. Create a Subscription Group called "HoopStats Subscriptions"
5. Add all products to this group

### 2.3 Create App Store Connect API Key
1. Go to "Users and Access" → "Keys" → "App Store Connect API"
2. Generate a new key with "Admin" access
3. Download the .p8 file and note:
   - Key ID
   - Issuer ID

### 2.4 Add to RevenueCat
1. In RevenueCat dashboard, go to Project Settings → Apps
2. Click "New App" → Select "App Store"
3. Enter your Bundle ID
4. Upload the App Store Connect API Key (.p8 file)
5. Enter the Key ID and Issuer ID
6. Copy the **RevenueCat iOS API Key** (starts with `appl_`)

## Step 3: Configure Android App (Google Play Console)

### 3.1 Create App in Google Play Console
1. Log in to [Google Play Console](https://play.google.com/console)
2. Create a new app (if not already created)
3. Note your **Package Name** (e.g., `com.yourcompany.hoopstats`)

### 3.2 Create In-App Products
1. Go to your app → "Monetize" → "Subscriptions"
2. Create the following subscription products:

| Product ID | Billing Period | Price | Description |
|------------|----------------|-------|-------------|
| `pro_monthly` | Monthly | $6.99 | Pro Monthly |
| `pro_yearly` | Yearly | $69.99 | Pro Yearly |
| `team_monthly` | Monthly | $19.99 | Team Monthly |
| `team_yearly` | Yearly | $199.99 | Team Yearly |

### 3.3 Create Service Account
1. Go to "Setup" → "API access"
2. Click "Create new service account"
3. Follow the link to Google Cloud Console
4. Create a service account with "Editor" role
5. Create and download JSON key
6. Back in Play Console, grant "Admin" access to the service account

### 3.4 Add to RevenueCat
1. In RevenueCat dashboard, go to Project Settings → Apps
2. Click "New App" → Select "Play Store"
3. Enter your Package Name
4. Upload the Service Account JSON credentials
5. Copy the **RevenueCat Android API Key** (starts with `goog_`)

## Step 4: Configure Products in RevenueCat

### 4.1 Create Entitlements
1. In RevenueCat, go to Project → Entitlements
2. Create two entitlements:
   - Identifier: `pro` - Description: "Pro Features"
   - Identifier: `team` - Description: "Team Features"

### 4.2 Create Products
1. Go to Project → Products
2. Add products for each platform:

**iOS Products:**
- `pro_monthly` → Attach to `pro` entitlement
- `pro_yearly` → Attach to `pro` entitlement
- `team_monthly` → Attach to `team` entitlement
- `team_yearly` → Attach to `team` entitlement

**Android Products:**
- Same as iOS

### 4.3 Create Offerings
1. Go to Project → Offerings
2. Create a "default" offering
3. Add packages:
   - `$rc_monthly` → pro_monthly (both platforms)
   - `$rc_annual` → pro_yearly (both platforms)
   - `team_monthly` → team_monthly (both platforms)
   - `team_yearly` → team_yearly (both platforms)

## Step 5: Update App Code

### 5.1 Update API Keys
Open `/app/frontend/src/stores/purchaseStore.ts` and replace:

```typescript
// Replace these with your actual RevenueCat API keys
const REVENUECAT_API_KEY_IOS = 'appl_YOUR_IOS_API_KEY_HERE';
const REVENUECAT_API_KEY_ANDROID = 'goog_YOUR_ANDROID_API_KEY_HERE';
```

### 5.2 Configure Expo
For production builds, add to `app.json`:

```json
{
  "expo": {
    "plugins": [
      [
        "react-native-purchases",
        {
          "ios": {
            "paymentProvider": "DEFAULT"
          },
          "android": {
            "paymentProvider": "DEFAULT"
          }
        }
      ]
    ]
  }
}
```

## Step 6: Testing

### iOS Sandbox Testing
1. In App Store Connect, create Sandbox Test Accounts
2. On your iOS device, sign out of your real Apple ID
3. When prompted during purchase, sign in with sandbox account
4. Sandbox subscriptions renew quickly (monthly = 5 mins, yearly = 1 hour)

### Android Testing
1. In Google Play Console, go to "Setup" → "License testing"
2. Add tester email addresses
3. Testers can make purchases without being charged

### RevenueCat Sandbox Mode
RevenueCat automatically detects sandbox purchases and marks them appropriately.

## Step 7: Sync Subscriptions with Backend

To sync RevenueCat subscription status with your backend:

### Option A: Webhooks (Recommended)
1. In RevenueCat → Project Settings → Integrations → Webhooks
2. Add your backend webhook URL: `https://your-api.com/api/webhooks/revenuecat`
3. RevenueCat will POST subscription events to your backend

### Option B: Server-side Verification
Use RevenueCat's REST API to verify subscriptions:

```python
# Backend endpoint example
@api_router.post("/verify-subscription")
async def verify_subscription(user_id: str):
    response = requests.get(
        f"https://api.revenuecat.com/v1/subscribers/{user_id}",
        headers={
            "Authorization": f"Bearer {REVENUECAT_SECRET_KEY}",
            "Content-Type": "application/json"
        }
    )
    # Update user subscription in database based on response
```

## Pricing Recommendations

| Tier | Monthly | Yearly | Savings |
|------|---------|--------|---------|
| Pro | $6.99 | $69.99 | ~17% |
| Team | $19.99 | $199.99 | ~17% |

## Troubleshooting

### Common Issues

1. **"No offerings found"**
   - Ensure products are approved in App Store Connect / Google Play
   - Check product IDs match exactly
   - Verify entitlements are properly linked

2. **"Purchase failed"**
   - iOS: Check sandbox account is properly configured
   - Android: Ensure app is published to internal testing track

3. **"Invalid API key"**
   - Double-check API keys are correct
   - Ensure using public keys (not secret keys) in the app

### Debug Mode
RevenueCat logs are enabled in development. Check console for:
- SDK initialization status
- Offerings fetch results
- Purchase flow details

## Resources

- [RevenueCat Documentation](https://docs.revenuecat.com)
- [RevenueCat React Native SDK](https://docs.revenuecat.com/docs/reactnative)
- [App Store Subscriptions Guide](https://developer.apple.com/app-store/subscriptions/)
- [Google Play Billing](https://developer.android.com/google/play/billing)

## Support

For RevenueCat support: support@revenuecat.com
For app-specific issues: Check the RevenueCat dashboard for error logs
