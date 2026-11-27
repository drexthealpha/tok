plugins { id("com.android.application") }

android {
    namespace = "io.github.drexthealpha.tok"
    compileSdk = 35
    defaultConfig {
        applicationId = "io.github.drexthealpha.tok"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
        // The app opens Tok's page; there the page signs with the phone's
        // wallet through Mobile Wallet Adapter instead of a passkey.
        manifestPlaceholders["startUrl"] = "https://drexthealpha.github.io/tok/?app=android"
        manifestPlaceholders["host"] = "drexthealpha.github.io"
    }
    buildTypes {
        release { isMinifyEnabled = false }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.5.0")
}
