const express = require('express');
const dotenv = require('dotenv').config();
if (dotenv.error) {
  throw dotenv.error;
}
const fs = require('fs');
const FormData = require('form-data');
const bodyParser = require('body-parser');
const cors = require('cors');
const supabase = require("./src/config/supabase");
const swaggerSpec = require("./src/config/swaggerConfig");
const swaggerUi = require("swagger-ui-express");
const app = express();
const port = process.env.PORT || 3009;
const templateroutes = require("./src/routes/templateRoutes");
const { default: axios } = require('axios');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
// CORS Configuration
const allowedOrigins = [
	"http://meta-api.tybot.ma",
  "http://localhost:5173"
];
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.error("Blocked by CORS:", origin);
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  credentials: true,
};
app.use(cors(corsOptions));
// app.use(cors());

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
// Swagger setup
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/template',templateroutes)




app.get('/', async (req, res) => {
  
    res.json({
        message: 'Hello, welcome to The Tybot-Meta APIs!',
        timestamp: new Date().toISOString()
    });

}
);
app.post('/upload-template-image', upload.single('file'), async (req, res) => {
  try {
    const filePath = req.file.path;
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));
    form.append('type', 'image/jpeg');
    form.append('messaging_product', 'whatsapp');

    const { data } = await axios.post(
      `https://graph.facebook.com/v19.0/<WABA_ID>/media`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          'Authorization': `Bearer ${process.env.FB_ACCESS_TOKEN}`
        }
      }
    );

    res.json({ media_id: data.id });
  } catch (err) {
    console.error("Upload failed:", err);
    res.status(500).json({ error: 'Upload failed' });
  }
});
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
