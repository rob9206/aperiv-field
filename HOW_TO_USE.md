# How to use Aperiv Field

Quick guide for testers (e.g. Kevin) — what the app does and how to run a room scan.

## What it is

**Aperiv Field** is the phone app for on-site turnover walkthroughs. You sign in, walk a room with the LiDAR camera, and save / share the 3D scan files.

## What you need

- An **iPhone Pro** or **iPad Pro with LiDAR** (for example iPhone 12 Pro or later Pro models)
- **iOS 16.4** or newer
- An install link (TestFlight invite, or the ad-hoc install URL we send you)
- The **email and password** we give you for sign-in

Non-Pro iPhones do not have LiDAR, so room scanning will not work on those devices.

## Install

1. Open the install link we send you on the iPhone/iPad that will do the scanning.
2. Install **Aperiv Field**.
3. If iOS asks about developer / enterprise trust for an ad-hoc build, allow it in **Settings → General → VPN & Device Management**.
4. Open the app.

You do **not** need Expo Go. Use the Aperiv Field app we installed for you.

## Sign in

1. On the home screen, tap **Sign in →**.
2. Enter the email and password we provided.
3. Tap **Sign in**.
4. You should land back on home with something like: `Signed in as you@example.com`.

If sign-in fails, double-check the email/password, or message us and we will reset access.

## Run a room scan

1. From home, tap **Start walkthrough →**.
2. On the walkthrough screen, tap **Start room scan**.
3. Allow camera access if iOS asks.
4. Walk the room **slowly**:
   - Point the phone at each wall
   - Capture corners, doors, windows, and large furniture
   - Keep moving until the room outline looks complete
5. When you are done, tap **Done**.
6. Leave the app open while it shows **Processing room scan…**
7. When you see **Scan saved**, you can:
   - Tap **Share files** to send the `.usdz` and `.json` files (AirDrop, Messages, email, Files, etc.)
   - Tap **Re-scan** if you want to capture the room again

Tap **Cancel** during a scan if you want to abort and start over.

## Tips for a good scan

- Good lighting helps.
- Move slowly — rushing leaves holes in the model.
- Stand back enough to see whole walls, then fill in details.
- Try not to cover the camera / LiDAR area at the top of the phone.
- Keep the screen open until processing finishes.

## If something looks wrong

| What you see | What to do |
| --- | --- |
| **Room scanning unavailable** | That device does not support RoomPlan / LiDAR. Use a Pro iPhone or LiDAR iPad Pro. |
| **New iOS build required** | You are on an old install. Ask us for a fresh install link and reinstall. |
| **Scan interrupted** | Tap **Try again**, then start a new scan. |
| Share fails | Files are still on the phone — try Share again, or AirDrop / save to Files. |
| Asked to sign in again | Session expired — sign in with the same email/password. |

## What happens to the files

Scans are saved **on the device**. Sharing exports both RoomPlan files:

- a **USDZ** 3D model
- a **JSON** room description

Send those to us (or upload wherever we ask) after each walkthrough.

## Need help?

Message the person who sent you this app with:

1. What you were trying to do
2. A screenshot of the screen / error
3. Your phone model (Settings → General → About)
