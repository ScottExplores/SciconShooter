# Build the Play bundle

The upload keystore, its passwords, and the signed `.aab` / `.apk` are not in git. Generate a keystore locally and keep `android-twa/keystore.properties` untracked.

Requirements: JDK 17+, Android SDK 36, Gradle 8.13.

```bash
export ANDROID_HOME="$HOME/android-sdk"
export JAVA_HOME="$(dirname $(dirname $(readlink -f $(which java))))"

keytool -genkeypair -v \
  -keystore "$HOME/scicon-play-upload.jks" \
  -alias scicon-play-upload \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass "$STORE_PASSWORD" -keypass "$STORE_PASSWORD" \
  -dname "CN=SciCon Shooter, OU=Play, O=Scicon Shooter, C=US"

# PKCS12 uses the store password for the key as well.
cat > android-twa/keystore.properties << EOF
storeFile=$HOME/scicon-play-upload.jks
storePassword=$STORE_PASSWORD
keyAlias=scicon-play-upload
keyPassword=$STORE_PASSWORD
EOF

keytool -list -v -keystore "$HOME/scicon-play-upload.jks" -alias scicon-play-upload -storepass "$STORE_PASSWORD"

cd android-twa
gradle wrapper --gradle-version 8.13
./gradlew bundleRelease assembleRelease
```

Outputs:

- `android-twa/app/build/outputs/bundle/release/app-release.aab`
- `android-twa/app/build/outputs/apk/release/app-release.apk`

Put the upload key's SHA-256 into `public/.well-known/assetlinks.json` as the first entry of `sha256_cert_fingerprints`. After Play App Signing enrolls the app, append the App signing certificate SHA-256 as the next array item and deploy `android-play` again. Do not remove the upload fingerprint.

`targetSdk` is 36, which is Google Play's minimum for new apps as of August 31, 2026. `versionCode` is 1 and `versionName` is 1.0.0. The app is portrait and immersive. The splash image is `public/icon.png`.
