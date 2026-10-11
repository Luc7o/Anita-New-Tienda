const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

// El access token YA NO se guarda en localStorage: vive solo en esta
// variable, en memoria. Se pierde al recargar la página a propósito — para
// recuperar la sesión al recargar, AuthContext llama a /auth/refrescar-token
// apenas monta la app, que funciona gracias a la cookie httpOnly de refresh
// (el navegador la manda solo, JS nunca la toca). Así, un XSS que lea
// localStorage/sessionStorage ya no puede robarse ninguno de los dos tokens.
let accessToken = null;

function getToken() {
  return accessToken;
}
function setAccessToken(token) {
  accessToken = token;
}
function clearAccessToken() {
  accessToken = null;
  guardarCsrf(null);
}

// Lee el valor de la cookie no-httpOnly que Flask-JWT-Extended deja junto a
// la cookie de refresh, para el patrón CSRF de doble envío. La cookie del
// refresh token en sí es httpOnly — esta otra existe justamente para que el
// frontend pueda probar "conozco el token" sin poder leerlo directamente.
function leerCookie(nombre) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${nombre}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// Token CSRF del refresh. Si frontend y API están en sitios distintos (ej.
// el frontend en *.vercel.app y la API en api.<dominio propio>), el navegador
// NO deja a JavaScript leer la cookie csrf_refresh_token (pertenece a otro
// dominio), así que el backend también la manda en el JSON de login/refresh y
// la guardamos acá. Va en localStorage (no en memoria) porque tiene que
// sobrevivir a una recarga —justo cuando se necesita para recuperar la sesión—
// y para que todas las pestañas usen siempre el valor más reciente (el
// refresh rota el token). No es un secreto: solo sirve junto con la cookie
// httpOnly de refresh, que JavaScript nunca ve.
const CLAVE_CSRF = "ans_csrf_refresh";

function guardarCsrf(valor) {
  try {
    if (valor) localStorage.setItem(CLAVE_CSRF, valor);
    else localStorage.removeItem(CLAVE_CSRF);
  } catch {
    // localStorage bloqueado (modo privado estricto): se sigue con la cookie.
  }
}

function leerCsrf() {
  // Si la cookie es legible (mismo sitio), es siempre la fuente más fiable.
  const deCookie = leerCookie("csrf_refresh_token");
  if (deCookie) return deCookie;
  try {
    return localStorage.getItem(CLAVE_CSRF) || "";
  } catch {
    return "";
  }
}

// Cuando el refresh token también expiró (o no existe), no hay forma de
// recuperar la sesión sola: hay que avisarle a la app para que mande al
// usuario a loguearse de nuevo. AuthContext escucha este evento.
function notificarSesionExpirada() {
  clearAccessToken();
  window.dispatchEvent(new Event("ans:sesion-expirada"));
}

// Evita que, si varias llamadas fallan por token expirado casi al mismo
// tiempo, se disparen varios refrescos en paralelo — todas esperan el mismo.
let refrescoEnCurso = null;

async function refrescarAccessToken() {
  if (refrescoEnCurso) return refrescoEnCurso;

  refrescoEnCurso = (async () => {
    const res = await fetch(`${BASE_URL}/auth/refrescar-token`, {
      method: "POST",
      credentials: "include", // manda la cookie httpOnly de refresh
      headers: { "X-CSRF-Token": leerCsrf() },
    });
    if (!res.ok) throw new Error("El refresh token también expiró");

    const data = await res.json();
    setAccessToken(data.token);
    if (data.csrf) guardarCsrf(data.csrf);
    return data.token;
  })();

  try {
    return await refrescoEnCurso;
  } finally {
    refrescoEnCurso = null;
  }
}

// Wrapper de fetch para llamadas autenticadas: si el access token expiró
// (code "token_expirado"), pide uno nuevo con el refresh token UNA vez y
// reintenta la misma llamada. Si el refresh también falla, cierra la
// sesión localmente. Lo usan tanto `request()` (JSON) como las subidas de
// archivos (FormData) más abajo.
async function fetchAutenticado(url, construirInit) {
  let res = await fetch(url, { credentials: "include", ...construirInit(getToken()) });

  if (res.status === 401) {
    const data = await res.clone().json().catch(() => null);
    if (data?.code === "token_expirado") {
      try {
        const nuevoToken = await refrescarAccessToken();
        res = await fetch(url, { credentials: "include", ...construirInit(nuevoToken) });
      } catch {
        notificarSesionExpirada();
      }
    } else if (data?.code === "token_invalido") {
      notificarSesionExpirada();
    }
  }

  return res;
}

async function request(path, { method = "GET", body, auth = false } = {}) {
  const construirInit = (token) => ({
    method,
    headers: {
      "Content-Type": "application/json",
      ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const res = auth
    ? await fetchAutenticado(`${BASE_URL}${path}`, construirInit)
    : await fetch(`${BASE_URL}${path}`, { credentials: "include", ...construirInit() });

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const mensaje = data?.error || "Ocurrió un error, intenta de nuevo.";
    const err = new Error(mensaje);
    // Algunos endpoints (ej. checkout con stock insuficiente) devuelven
    // detalle estructurado además del mensaje genérico — lo dejamos colgado
    // del error para que el componente que llama pueda usarlo si lo necesita,
    // en vez de perderlo acá.
    err.data = data;
    err.status = res.status;
    throw err;
  }
  return data;
}

// Para descargar PDFs (boletas, reportes) — a diferencia de request(), la
// respuesta NO es JSON, así que arma su propio manejo de errores y dispara
// la descarga del blob directamente en el navegador.
async function descargarPdf(path, nombreArchivo) {
  const construirInit = (token) => ({
    method: "GET",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  const res = await fetchAutenticado(`${BASE_URL}${path}`, construirInit);

  if (!res.ok) {
    let mensaje = "No se pudo generar el PDF";
    try {
      const data = await res.json();
      mensaje = data?.error || mensaje;
    } catch {
      // La respuesta de error no vino en JSON — nos quedamos con el mensaje genérico.
    }
    throw new Error(mensaje);
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  window.URL.revokeObjectURL(url);
}

// --- KPIs: eventos de analítica (embudo de compra) ---
// sesion_id: un id anónimo por navegador, generado una sola vez y guardado
// en localStorage (no es el JWT ni depende de tener cuenta — sirve para
// medir embudo también de visitantes no logueados).
function obtenerSesionAnalitica() {
  const CLAVE = "ans_sesion_analitica";
  let sesion = localStorage.getItem(CLAVE);
  if (!sesion) {
    sesion = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
    localStorage.setItem(CLAVE, sesion);
  }
  return sesion;
}

// Fire-and-forget a propósito: un evento de analítica que falla (red caída,
// ad-blocker, etc.) nunca debe romper ni frenar la acción real del usuario
// (agregar al carrito, pagar...), así que nunca se propaga el error ni se
// espera con await en el caller.
function registrarEvento(tipoEvento, { productoId, metadata } = {}) {
  fetch(`${BASE_URL}/eventos`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    body: JSON.stringify({
      tipo_evento: tipoEvento,
      sesion_id: obtenerSesionAnalitica(),
      producto_id: productoId ?? null,
      metadata: metadata ?? null,
    }),
  }).catch(() => {
    // Silencioso a propósito — ver comentario de arriba.
  });
}

export const api = {
  registrarEvento,

  // Auth
  registro: (payload) => request("/auth/registro", { method: "POST", body: payload }),
  continuarComoInvitado: (payload) => request("/auth/invitado", { method: "POST", body: payload }),
  completarCuenta: (payload) =>
    request("/auth/completar-cuenta", { method: "POST", body: payload, auth: true }),
  refrescarToken: () => refrescarAccessToken(),
  consultarDocumento: (tipo, numero) =>
    request(`/documentos/consultar?tipo=${encodeURIComponent(tipo)}&numero=${encodeURIComponent(numero)}`),
  login: (payload) => request("/auth/login", { method: "POST", body: payload }),
  loginGoogle: (credential) => request("/auth/google", { method: "POST", body: { credential } }),
  perfil: () => request("/auth/perfil", { auth: true }),
  actualizarPerfil: (payload) =>
    request("/auth/perfil", { method: "PUT", body: payload, auth: true }),
  cambiarPassword: (payload) =>
    request("/auth/cambiar-password", { method: "PUT", body: payload, auth: true }),
  olvidePassword: (email) => request("/auth/olvide-password", { method: "POST", body: { email } }),
  restablecerPassword: (payload) =>
    request("/auth/restablecer-password", { method: "POST", body: payload }),
  logout: () =>
    fetch(`${BASE_URL}/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers: { "X-CSRF-Token": leerCsrf() },
    }),

  // Ubicación (catálogo departamento -> provincia -> distrito, para los
  // selects en cascada del formulario de dirección)
  departamentos: () => request("/ubicaciones/departamentos"),
  provincias: (departamentoId) => request(`/ubicaciones/provincias?departamento_id=${departamentoId}`),
  distritos: (provinciaId) => request(`/ubicaciones/distritos?provincia_id=${provinciaId}`),

  // Catálogo
  categorias: () => request("/categorias"),
  productos: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/productos${query ? `?${query}` : ""}`);
  },
  producto: (id) => request(`/productos/${id}`),
  resenas: (productoId) => request(`/productos/${productoId}/resenas`),
  // Reseñas de toda la tienda (página pública de Reviews)
  resenasRecientes: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/resenas${query ? `?${query}` : ""}`);
  },
  guardarResena: (productoId, payload) =>
    request(`/productos/${productoId}/resenas`, { method: "POST", body: payload, auth: true }),
  eliminarResena: (productoId) =>
    request(`/productos/${productoId}/resenas`, { method: "DELETE", auth: true }),

  // Favoritos
  favoritos: () => request("/favoritos", { auth: true }),
  favoritosIds: () => request("/favoritos/ids", { auth: true }),
  agregarFavorito: (productoId) =>
    request(`/favoritos/${productoId}`, { method: "POST", auth: true }),
  quitarFavorito: (productoId) =>
    request(`/favoritos/${productoId}`, { method: "DELETE", auth: true }),

  // Promociones (carrusel del inicio)
  promocionesActivas: () => request("/promociones/activas"),

  // Carrito
  verCarrito: () => request("/carrito", { auth: true }),
  agregarAlCarrito: (payload) =>
    request("/carrito/agregar", { method: "POST", body: payload, auth: true }),
  actualizarItemCarrito: (itemId, payload) =>
    request(`/carrito/${itemId}`, { method: "PUT", body: payload, auth: true }),
  eliminarItemCarrito: (itemId) =>
    request(`/carrito/${itemId}`, { method: "DELETE", auth: true }),

  // Pedidos
  checkout: (payload) => request("/pedidos/checkout", { method: "POST", body: payload, auth: true }),
  misPedidos: () => request("/pedidos", { auth: true }),
  pedido: (id) => request(`/pedidos/${id}`, { auth: true }),
  pagarPedido: (pedidoId, payload) =>
    request(`/pedidos/${pedidoId}/pagar`, { method: "POST", body: payload, auth: true }),
  cancelarPedido: (id) => request(`/pedidos/${id}/cancelar`, { method: "POST", auth: true }),
  boletaPedido: (id, numeroPedido) =>
    descargarPdf(`/pedidos/${id}/boleta`, `boleta-${numeroPedido}.pdf`),

  // Libro de Reclamaciones (público)
  reclamacionesInfo: () => request("/reclamaciones/info"),
  enviarReclamo: (payload) => request("/reclamaciones", { method: "POST", body: payload }),
};

export { getToken, setAccessToken, clearAccessToken, guardarCsrf };
