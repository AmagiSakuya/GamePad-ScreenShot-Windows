const { defineConfig } = require('@vue/cli-service')
const path = require('path')

module.exports = defineConfig({
  transpileDependencies: true,
  configureWebpack: {
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src')
      },
      fallback: {
        "path": require.resolve("path-browserify"),
        "fs": false,
        "crypto": false,
        "stream": false,
        "assert": false,
        "http": false,
        "https": false,
        "os": false,
        "url": false
      }
    }
  },
  pluginOptions: {
    electronBuilder: {
      preload: 'src/preload.js',
      externals: ['screenshot-desktop'],
      builderOptions: {
        "productName": "Gamepad Full-ScreenShot Tool",
        "win": {
          "icon": "src/gamepad.ico",
          "target": ["dir"]
        },
        asarUnpack: [
          'preload.js',
          'node_modules/screenshot-desktop/**'
        ],
        extraResources: [
          {
            from: "src/gamepad.ico",
            to: "./" 
          },
          {
            from: "src/assets/recording.ico",
            to: "./assets/recording.ico" 
          },
          {
            from: "src/screenshot-notification.html",
            to: "./html/screenshot-notification.html" 
          }
        ]
      }
    }
  }
})
