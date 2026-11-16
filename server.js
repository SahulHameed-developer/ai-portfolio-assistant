require('./env');
const { createApp } = require('./app');

const port = process.env.PORT || 3000;
createApp().listen(port, () => console.log(`AI portfolio assistant running on http://localhost:${port}`));
