// Einstiegspunkt fuer das Bundle der nativen Plugins (npm run build:www -> www/vendor/native.js, nicht eingecheckt).
// Wird nur auf iOS/Android geladen; im Browser (Entwicklung/Test) gibt es das Bundle nicht und die Shell nutzt den Arbeitsspeicher.
import {SecureStorage, KeychainAccess} from '@aparajita/capacitor-secure-storage';
import {SplashScreen} from '@capacitor/splash-screen';
import {App} from '@capacitor/app';
import {Network} from '@capacitor/network';
import {StatusBar} from '@capacitor/status-bar';
globalThis.VUNative = {SecureStorage, KeychainAccess, SplashScreen, App, Network, StatusBar};
