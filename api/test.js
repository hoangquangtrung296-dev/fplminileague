module.exports = async function handler(req, res) {
  res.json({ message: 'Test API works', timestamp: new Date().toISOString() });
};
