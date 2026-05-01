const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
    packagerConfig: {
        asar: {
            unpack: '**/{onnxruntime-node,onnxruntime-common,@huggingface/transformers,sharp,@img}/**',
        },
        extraResource: [
            './src/assets/bin/SystemAudioDump',
            './src/assets/bin/whisper/main_darwin',
            './src/assets/bin/whisper/ggml-metal.metal',
            './src/assets/bin/whisper/main_win.exe',
            './src/assets/bin/whisper/main_linux',
        ],
        name: 'Secret Sauce',
        icon: 'src/assets/icons/logo',
        
        // CRITICAL MAC FIX: Ad-Hoc Signing (FREE)
        // We omit the 'identity' field so it doesn't ask for a paid Apple account,
        // but we MUST keep optionsForFile so your entitlements.plist gets attached.
        // Without this, macOS will silently block microphone and screen capture!
        osxSign: {
            optionsForFile: (filePath) => {
                return {
                    entitlements: 'entitlements.plist',
                };
            },
        },
    },
    rebuildConfig: {},
    makers: [
        {
            name: '@electron-forge/maker-squirrel',
            config: {
                name: 'secret-sauce',
                productName: 'Secret Sauce',
                shortcutName: 'Secret Sauce',
                createDesktopShortcut: true,
                createStartMenuShortcut: true,
            },
        },
        {
            name: '@electron-forge/maker-dmg',
            platforms: ['darwin'],
        },
        {
            name: '@reforged/maker-appimage',
            platforms: ['linux'],
            config: {
                options: {
                    name: 'Secret Sauce',
                    productName: 'Secret Sauce',
                    genericName: 'AI Assistant',
                    description: 'AI assistant for interviews and learning',
                    categories: ['Development', 'Education'],
                    icon: 'src/assets/icons/logo.png',
                },
            },
        },
    ],
    plugins: [
        {
            name: '@electron-forge/plugin-auto-unpack-natives',
            config: {},
        },
        new FusesPlugin({
            version: FuseVersion.V1,
            [FuseV1Options.RunAsNode]: false,
            [FuseV1Options.EnableCookieEncryption]: true,
            [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
            [FuseV1Options.EnableNodeCliInspectArguments]: false,
            
            // CRITICAL FOR FREE DISTRIBUTION: 
            // Because the app is unsigned (ad-hoc), these MUST be false. 
            // If they are true, macOS will kill the app on launch.
            [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: false,
            [FuseV1Options.OnlyLoadAppFromAsar]: false,
        }),
    ],
};