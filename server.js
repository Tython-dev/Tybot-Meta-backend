const express = require('express');
const dotenv = require('dotenv').config();
if (dotenv.error) {
  throw dotenv.error;
}
const bodyParser = require('body-parser');
const cors = require('cors');
const supabase = require("./src/config/supabase");
const swaggerSpec = require("./src/config/swaggerConfig");
const swaggerUi = require("swagger-ui-express");
const app = express();
const port = process.env.PORT || 3009;
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
// Swagger setup
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));





app.get('/', async (req, res) => {
  
    res.json({
        message: 'Hello, welcome to The Tybot-Meta APIs!',
        timestamp: new Date().toISOString()
    });

}
);

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
