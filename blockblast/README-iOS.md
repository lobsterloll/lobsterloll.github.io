# Aster Blocks for iPhone

This folder contains the native iOS project. The game files are bundled inside the app, so playing needs no internet connection. Building and signing the app requires a Mac with Xcode 26 or newer and an Apple Developer signing team.

## Create the `.ipa` on your Mac

1. Unzip the iOS project and open `ios/App/App.xcodeproj` in Xcode. Keep the whole project folder together. Xcode may download the Capacitor Swift package on the first build.
2. Select the **App** target. Under **Signing & Capabilities**, enable **Automatically manage signing** and choose your team. If Xcode says the bundle identifier is unavailable, give it a unique identifier there.
3. To test on your iPhone first, connect it, select it as the run destination, and choose **Product → Run**.
4. For an `.ipa`, choose **Any iOS Device** as the run destination and select **Product → Archive**. In the Archives organizer, select the new archive, choose **Distribute App → Debugging → Export**, and save the exported `.ipa`.
5. To install that `.ipa`, connect your registered iPhone, open **Window → Devices and Simulators**, select the phone, then use the **+** button under **Installed Apps** to choose the file. Enable **Developer Mode** on the iPhone if prompted.

The `.ipa` must be signed for the iPhone that will run it. Xcode's direct **Run** command is the simplest way to install it on your own phone.

## Update the game later

The current `dist` files are already copied into `ios/App/App/public`. If you change `dist` on the Mac, run `npm ci` and `npm run ios:sync` in the project folder before building again.

The native app saves its own score and best score on the iPhone. An existing Safari Home Screen game's saved score does not transfer automatically.
