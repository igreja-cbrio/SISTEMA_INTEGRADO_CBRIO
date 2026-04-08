const { supabase } = require('../utils/supabase');

// Verifica token Supabase JWT e injeta req.user
async function authenticate(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token não fornecido' });

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }

  // Busca perfil do usuário (role, name, area etc.)
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, name, email, role, area, active')
    .eq('id', user.id)
    .single();

  if (!profile || !profile.active) {
    return res.status(403).json({ error: 'Usuário inativo ou sem perfil' });
  }

  req.user = {
    userId: user.id,
    email: user.email,
    role: profile.role,
    name: profile.name,
    area: profile.area,
  };

  next();
}

// Verifica se o role do usuário está na lista permitida
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Acesso negado para este perfil' });
    }
    next();
  };
}

module.exports = { authenticate, authorize };
