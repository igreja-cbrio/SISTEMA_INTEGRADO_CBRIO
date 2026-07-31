const router = require('express').Router();
const { authenticate, requireSuperAdmin } = require('../middleware/auth');
const { getFoundationPayload } = require('../config/systemCatalog');

router.use(authenticate);
router.use(requireSuperAdmin);

// Fundação somente leitura. Não consulta nem persiste secrets ou payloads.
router.get('/fundacao', (_req, res) => {
  res.json(getFoundationPayload());
});

module.exports = router;
