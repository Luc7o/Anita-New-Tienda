import React, { useEffect } from "react";
import { Routes, Route, useLocation, Link } from "react-router-dom";
import Navbar from "./components/Navbar.jsx";
import CartDrawer from "./components/CartDrawer.jsx";
import Footer from "./components/Footer.jsx";
import FormasPago from "./pages/FormasPago.jsx";
import MetodosEnvio from "./pages/MetodosEnvio.jsx";
import CambiosDevoluciones from "./pages/CambiosDevoluciones.jsx";
import GuiaTallas from "./pages/GuiaTallas.jsx";
import FAQ from "./pages/FAQ.jsx";
import Contacto from "./pages/Contacto.jsx";
import LibroReclamaciones from "./pages/LibroReclamaciones.jsx";
import PoliticaPrivacidad from "./pages/PoliticaPrivacidad.jsx";
import TerminosCondiciones from "./pages/TerminosCondiciones.jsx";
import QuienesSomos from "./pages/QuienesSomos.jsx";
import Reviews from "./pages/Reviews.jsx";
import NuestrasTiendas from "./pages/NuestrasTiendas.jsx";
import Mayoristas from "./pages/Mayoristas.jsx";
import TrabajaConNosotros from "./pages/TrabajaConNosotros.jsx";
import Home from "./pages/Home.jsx";
import Tienda from "./pages/Tienda.jsx";
import ProductoDetalle from "./pages/ProductoDetalle.jsx";
import Login from "./pages/Login.jsx";
import Registro from "./pages/Registro.jsx";
import OlvidePassword from "./pages/OlvidePassword.jsx";
import RestablecerPassword from "./pages/RestablecerPassword.jsx";
import Perfil from "./pages/Perfil.jsx";
import PerfilPedidos from "./pages/PerfilPedidos.jsx";
import Configuracion from "./pages/Configuracion.jsx";
import Favoritos from "./pages/Favoritos.jsx";
import Ayuda from "./pages/Ayuda.jsx";
import Checkout from "./pages/Checkout.jsx";
import Pedidos from "./pages/Pedidos.jsx";
import PedidoDetalle from "./pages/PedidoDetalle.jsx";
import { useAuth } from "./context/AuthContext.jsx";
import { useCarrito } from "./context/CarritoContext.jsx";
import { api } from "./api/client.js";

export default function App() {
  const { usuario, sesionExpirada, setSesionExpirada } = useAuth();
  const { refrescar } = useCarrito();
  const location = useLocation();
  const esAuth =
    location.pathname === "/ingresar" ||
    location.pathname === "/registro" ||
    location.pathname === "/olvide-password" ||
    location.pathname === "/restablecer-password";
  const esCuenta =
    location.pathname === "/perfil" ||
    location.pathname === "/perfil/pedidos" ||
    location.pathname === "/perfil/favoritos" ||
    location.pathname === "/perfil/configuracion" ||
    location.pathname === "/perfil/ayuda";

  useEffect(() => {
    if (usuario) refrescar();
  }, [usuario, refrescar]);

  // Vista de página para KPIs de negocio (tipo "vista_pagina" del modelo
  // EventoAnalitica). Esta app es solo la tienda pública, así que toda
  // navegación cuenta como visita.
  useEffect(() => {
    api.registrarEvento("vista_pagina", { metadata: { ruta: location.pathname } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // El aviso de sesión expirada se limpia solo al cambiar de página (por
  // ejemplo, al ir a /ingresar), para no dejarlo pegado después de que el
  // usuario ya reaccionó.
  useEffect(() => {
    if (sesionExpirada) setSesionExpirada(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const bannerSesionExpirada = sesionExpirada && (
    <div className="bg-berry px-4 py-2.5 text-center text-sm font-medium text-white">
      Tu sesión expiró.{" "}
      <Link to="/ingresar" className="underline">
        Vuelve a iniciar sesión
      </Link>
      .
    </div>
  );

  if (esAuth) {
    return (
      <div className="min-h-screen">
        {bannerSesionExpirada}
        <Routes>
          <Route path="/ingresar" element={<Login />} />
          <Route path="/registro" element={<Registro />} />
          <Route path="/olvide-password" element={<OlvidePassword />} />
          <Route path="/restablecer-password" element={<RestablecerPassword />} />
        </Routes>
      </div>
    );
  }

  if (esCuenta) {
    return (
      <div className="min-h-screen">
        {bannerSesionExpirada}
        <Routes>
          <Route path="/perfil" element={<Perfil />} />
          <Route path="/perfil/pedidos" element={<PerfilPedidos />} />
          <Route path="/perfil/favoritos" element={<Favoritos />} />
          <Route path="/perfil/configuracion" element={<Configuracion />} />
          <Route path="/perfil/ayuda" element={<Ayuda />} />
        </Routes>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {bannerSesionExpirada}
      <Navbar />
      <main className="pt-8">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/tienda" element={<Tienda />} />
          <Route path="/producto/:id" element={<ProductoDetalle />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/pedidos" element={<Pedidos />} />
          <Route path="/pedidos/:id" element={<PedidoDetalle />} />
          <Route path="/formas-de-pago" element={<FormasPago />} />
          <Route path="/metodos-de-envio" element={<MetodosEnvio />} />
          <Route path="/cambios-devoluciones" element={<CambiosDevoluciones />} />
          <Route path="/guia-de-tallas" element={<GuiaTallas />} />
          <Route path="/faq" element={<FAQ />} />
          <Route path="/contacto" element={<Contacto />} />
          <Route path="/libro-reclamaciones" element={<LibroReclamaciones />} />
          <Route path="/politica-de-privacidad" element={<PoliticaPrivacidad />} />
          <Route path="/terminos-y-condiciones" element={<TerminosCondiciones />} />
          <Route path="/quienes-somos" element={<QuienesSomos />} />
          <Route path="/reviews" element={<Reviews />} />
          <Route path="/tiendas" element={<NuestrasTiendas />} />
          <Route path="/mayoristas" element={<Mayoristas />} />
          <Route path="/trabaja-con-nosotros" element={<TrabajaConNosotros />} />
        </Routes>
      </main>
      <CartDrawer />
      <Footer />
    </div>
  );
}