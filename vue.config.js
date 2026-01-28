const { defineConfig } = require('@vue/cli-service')
module.exports = defineConfig({
  transpileDependencies: true,
  pluginOptions: {
    electronBuilder: {
      preload: 'src/preload.js',
      builderOptions: {
        "productName": "Gamepad Full-ScreenShot Tool",
        "win": {
          "icon": "src/gamepad.ico",
          "target": ["dir"]
        },
        asarUnpack: [
          'preload.js',
          '**/*.mp3'
        ],
        extraResources: [
          {
            from: 'src/assets/ns2截图音.mp3',
            to: 'assets/ns2截图音.mp3'
          }
        ]
      }
    }
  }
})
