// index.js
require('dotenv').config();
const express = require('express');
const path = require('path');

// Import the modular routers
const cfRouter = require('./routes/cf');
const ccRouter = require('./routes/cc');

const app = express();
const port = process.env.PORT || 3000;

// Top level middlewares
app.use(express.static(path.join(__dirname, 'public')));

// Mount the routers to their respective base URLs
app.use('/card/cf', cfRouter);
app.use('/card/cc', ccRouter);

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});