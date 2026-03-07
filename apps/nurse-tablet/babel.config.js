module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['.'],
          alias: {
            '@': './src',
            '@components': './src/components',
            '@screens': './src/screens',
            '@store': './src/store',
            '@config': './src/config',
            '@navigation': './src/navigation',
            '@hooks': './src/hooks',
            '@services': './src/services',
          },
        },
      ],
      'react-native-reanimated/plugin',
    ],
  };
};
