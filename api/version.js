/* Que version esta viva en el servidor. La app la mira cada rato y, si no es la
   que tiene abierta, ofrece actualizar.

   Antes esto se hacia con un sello escrito a mano en el index ("bitacora-build")
   que nadie volvio a tocar desde septiembre: la app comparaba el sello consigo
   mismo, siempre daba igual, y en el telefono se quedaba la version vieja sin
   que nada lo dijera. El commit lo pone Vercel solo en cada despliegue. */
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const build =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    '';
  return res.status(200).json({ build, desde: process.env.VERCEL_ENV || 'local' });
}
