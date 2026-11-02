// Sentry's Metro config adds debug ids to bundles so uploaded source maps match their events.
const { getSentryExpoConfig } = require("@sentry/react-native/metro");

module.exports = getSentryExpoConfig(__dirname);
