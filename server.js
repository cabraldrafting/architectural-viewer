const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Create uploads and backup folders if missing
const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}
const backupDir = path.join(uploadDir, 'backup');
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir);
}

// Upload storage setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'));
  }
});
const upload = multer({ 
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'model/gltf-binary' || file.originalname.endsWith('.glb')) {
      cb(null, true);
    } else {
      cb(new Error('Only .glb files are allowed'), false);
    }
  }
});

// Client management data
const clients = {
  'highway-projects': {
    name: 'Highway Projects Inc.',
    contact: 'john@highwayproj.com',
    projects: {
      'highway001': {
        filename: '1758121257346-4650_highway_a1a_revised_7.24.glb',
        description: 'A1A Highway Revision 7.24',
        uploaded: '2024-01-15'
      }
    }
  }
};

// Admin upload endpoint
app.post('/api/admin/upload', upload.single('model'), (req, res) => {
  console.log('POST /api/admin/upload hit:', req.body, req.file); // Debug
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded or invalid file type' });
  }
  
  const { clientId, projectId, description } = req.body;
  if (!clientId || !projectId) {
    return res.status(400).json({ error: 'Client ID and Project ID are required' });
  }
  
  try {
    // Initialize client if it doesn't exist
    if (!clients[clientId]) {
      clients[clientId] = {
        name: clientId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        contact: '',
        projects: {}
      };
    }
    
    // Add project to client
    clients[clientId].projects[projectId] = {
      filename: req.file.filename,
      description: description || `Project ${projectId}`,
      uploaded: new Date().toISOString().split('T')[0]
    };
    
    console.log(`✓ Uploaded and linked ${req.file.filename} to ${clientId}/${projectId}`);
    res.json({
      message: 'Model uploaded and linked successfully',
      filename: req.file.filename,
      url: `/uploads/${req.file.filename}`,
      clientId,
      projectId
    });
  } catch (error) {
    console.error('❌ Upload error:', error);
    res.status(500).json({ error: 'Failed to process upload' });
  }
});

// Admin endpoint - GET all clients and projects
app.get('/api/admin/clients', (req, res) => {
  console.log('GET /api/admin/clients hit');
  res.json({
    clients: Object.entries(clients).map(([id, client]) => ({
      id,
      ...client,
      projectCount: Object.keys(client.projects).length
    }))
  });
});

// Admin endpoint - Add new client (SIMPLIFIED: no project/model)
app.post('/api/admin/client', (req, res) => {
  console.log('POST /api/admin/client hit:', req.body);
  const { name, contact } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Client name is required' });
  }
  
  const clientId = name.toLowerCase().replace(/\s+/g, '-');
  
  if (clients[clientId]) {
    return res.status(400).json({ error: 'Client already exists' });
  }
  
  try {
    clients[clientId] = {
      name,
      contact: contact || '',
      projects: {}
    };
    
    console.log(`✓ Added client ${clientId}`);
    res.json({ 
      message: 'Client added successfully',
      clientId
    });
  } catch (error) {
    console.error('❌ Add client error:', error);
    res.status(500).json({ error: 'Failed to add client' });
  }
});

// DELETE endpoint - Remove a specific project (MOVES TO BACKUP FOLDER)
app.delete('/api/admin/client/:clientId/project/:projectId', (req, res) => {
  console.log('DELETE /api/admin/client hit with params:', req.params);
  
  const { clientId, projectId } = req.params;
  const client = clients[clientId];
  
  if (!client) {
    console.log('❌ Client not found:', clientId);
    return res.status(404).json({ error: 'Client not found' });
  }
  
  if (!client.projects[projectId]) {
    console.log('❌ Project not found:', projectId);
    return res.status(404).json({ error: 'Project not found' });
  }
  
  try {
    // Move the model file to backup folder
    const filename = client.projects[projectId].filename;
    const oldPath = path.join(__dirname, uploadDir, filename);
    const newPath = path.join(__dirname, backupDir, filename);
    
    if (fs.existsSync(oldPath)) {
      fs.renameSync(oldPath, newPath);
      console.log(`✓ Moved to backup: ${oldPath} → ${newPath}`);
    } else {
      console.log(`⚠ File not found for move: ${oldPath}`);
    }
    
    // Remove from memory
    delete client.projects[projectId];
    console.log(`✓ Soft-deleted project ${projectId} for client ${clientId}`);
    
    res.json({ 
      message: `Project ${projectId} moved to backup successfully`,
      remainingProjects: Object.keys(client.projects).length
    });
  } catch (error) {
    console.error('❌ Soft-delete error:', error);
    res.status(500).json({ error: 'Failed to move project to backup' });
  }
});

// DELETE endpoint - Remove entire client
app.delete('/api/admin/client/:clientId', (req, res) => {
  console.log('DELETE /api/admin/client hit:', req.params);
  
  const { clientId } = req.params;
  const client = clients[clientId];
  
  if (!client) {
    console.log('❌ Client not found:', clientId);
    return res.status(400).json({ error: 'Client not found' });
  }
  
  try {
    // Move all project files to backup
    Object.values(client.projects).forEach(project => {
      const oldPath = path.join(__dirname, uploadDir, project.filename);
      const newPath = path.join(__dirname, backupDir, project.filename);
      if (fs.existsSync(oldPath)) {
        fs.renameSync(oldPath, newPath);
        console.log(`✓ Moved to backup: ${oldPath} → ${newPath}`);
      }
    });
    
    // Remove from memory
    delete clients[clientId];
    console.log(`✓ Soft-deleted entire client ${clientId}`);
    
    res.json({ message: `Client ${clientId} and all projects moved to backup successfully` });
  } catch (error) {
    console.error('❌ Client soft-delete error:', error);
    res.status(500).json({ error: 'Failed to move client projects to backup' });
  }
});

// Client project lookup (UPDATED: searches by client NAME, not ID)
app.get('/api/client/:clientName/project/:number', (req, res) => {
  console.log('GET /api/client hit:', req.params);
  const { clientName, number: projectNumber } = req.params;
  
  // Find client by name (case-insensitive)
  const client = Object.values(clients).find(c => 
    c.name.toLowerCase() === clientName.toLowerCase()
  );
  
  if (!client) {
    console.log('❌ Client not found by name:', clientName);
    return res.status(404).json({ error: `Client "${clientName}" not found` });
  }
  
  console.log(`✅ Found client: ${client.name} (ID: ${Object.keys(clients).find(key => clients[key] === client)})`);
  
  const project = client.projects[projectNumber];
  if (project) {
    const filePath = path.join(__dirname, uploadDir, project.filename);
    if (fs.existsSync(filePath)) {
      res.json({ 
        modelPath: `/uploads/${project.filename}`,
        clientName: client.name,
        projectName: projectNumber,
        description: project.description
      });
    } else {
      console.log('❌ Model file not found:', filePath);
      res.status(404).json({ error: 'Model file not found' });
    }
  } else {
    console.log('❌ Project not found:', projectNumber);
    res.status(404).json({ error: `Project "${projectNumber}" not found for ${client.name}` });
  }
});

// Serve admin page
app.get('/admin', (req, res) => {
  console.log('GET /admin hit');
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});