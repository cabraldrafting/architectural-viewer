const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const app = express();
const port = 3000;

// Set up storage for uploaded files
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/'); // Folder where files will be saved
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname); // Keep original file name
  }
});
const upload = multer({ storage: storage }).array('files', 10); // Allow up to 10 files (OBJ + MTL + textures)

// Serve static files
app.use(express.static('public')); // Serves public/ at root (for HTML/JS)
app.use('/uploads', express.static('uploads')); // Serves uploads/ at /uploads
app.use('/node_modules', express.static('node_modules')); // Serves node_modules/ at /node_modules (so Three.js loads)

// Route for the upload page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'upload.html'));
});

// Route to handle file upload
app.post('/upload', (req, res) => {
  upload(req, res, (err) => {
    if (err) {
      return res.send('Error uploading files: ' + err.message);
    }
    const uniqueId = uuidv4(); // Generate unique ID for the link
    
    // Find the .obj or .glb file among uploads (assume one main model)
    const modelFile = req.files.find(file => file.originalname.endsWith('.obj') || file.originalname.endsWith('.glb'));
    if (!modelFile) {
      return res.send('No .obj or .glb file found in upload. Please include one.');
    }
    const modelPath = `/uploads/${modelFile.originalname}`;
    
    const viewLink = `http://localhost:${port}/view/${uniqueId}?model=${modelPath}`;
    res.send(`Upload successful! Uploaded files: ${req.files.map(f => f.originalname).join(', ')}<br>Share this link: <a href="${viewLink}">${viewLink}</a>`);
  });
});

// Route for viewing the model
app.get('/view/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'view.html'));
});

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});