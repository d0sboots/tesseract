"use strict";

const canvas = document.getElementById("canvas");
const gl = canvas.getContext("webgl", {antialias: true});
const vao_ext = gl.getExtension("OES_vertex_array_object");

function loadShader(program, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.log('Unable to compile shader:\n' + gl.getShaderInfoLog(shader));
  }
  gl.attachShader(program, shader);
}

// "attribs" is an array of the names of 'in' attributes,
// while "uniforms" is an array of the names of uniforms.
function initShaderProgram(vsSource, fsSource, attribs, uniforms) {
  const shaderProgram = gl.createProgram();
  loadShader(shaderProgram, gl.VERTEX_SHADER, vsSource);
  loadShader(shaderProgram, gl.FRAGMENT_SHADER, fsSource);

  gl.linkProgram(shaderProgram);

  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    console.log('Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram));
    return null;
  }

  const attribsResult = {}
  for (const a of attribs) {
    attribsResult[a] = gl.getAttribLocation(shaderProgram, a);
  }
  const uniformsResult = {}
  for (const u of uniforms) {
    uniformsResult[u] = gl.getUniformLocation(shaderProgram, u);
  }

  return {
    program: shaderProgram,
    attribs: attribsResult,
    uniforms: uniformsResult,
  };
}

function initBuffersSpinner(squareAttribs) {
  const vao = vao_ext.createVertexArrayOES();
  vao_ext.bindVertexArrayOES(vao);

  const vertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);

  // TRIANGLE_FAN data, 2 points per tri
  const vertexData = [
    -1.05, -1.05,
    1.05, -1.05,
    1.05, 1.05,
    -1.05, 1.05,
  ];

  gl.bufferData(gl.ARRAY_BUFFER,
    new Float32Array(vertexData),
    gl.STATIC_DRAW);

  const numComponents = 2;
  const type = gl.FLOAT;
  const normalize = false;
  const stride = 0;
  const offset = 0;
  gl.vertexAttribPointer(squareAttribs.position, numComponents, type, normalize, stride, offset);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  gl.enableVertexAttribArray(squareAttribs.position);
  vao_ext.bindVertexArrayOES(null);

  return {
    vertex: vao,
    vertexCount: vertexData.length / numComponents,
  };
}

function initGLStateSpinner() {
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.clearDepth(1.0);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);

  const squareShaderInfo = initShaderProgram(
   `attribute vec2 position;
    varying vec2 coords;
    uniform mat2 projMatrix;

    void main() {
      gl_Position = vec4(projMatrix * position, 0.0, 1.0);
      coords = position;
    }`,

   `precision highp float;

    varying vec2 coords;
    uniform float aliasUnit;
    const float innerRadius = 10.0 / 14.0;
    const float middleRadius = (1.0 + innerRadius) / 2.0;
    const float headRadius = (1.0 - innerRadius) / 2.0;
    const float PI = 3.14159265358979;

    void main() {
      float dist = length(coords);
      if (dist > 1.0 + aliasUnit || dist < innerRadius - aliasUnit) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
      }
      // This is a pile of stuff to anti-alias the sharp lines in the spinner,
      // and avoid branches while doing it.
      float head_dist = length(vec2(coords.x, coords.y - middleRadius));
      float gradient = atan(coords.x, -coords.y) / (2.0 * PI) + 0.5;
      bool in_head = coords.x < 0.0 && head_dist < headRadius + aliasUnit;
      float radiusPart = in_head ? headRadius : innerRadius;
      bool test = dist < 1.0 - aliasUnit || in_head;
      float edge0 = test ? radiusPart - aliasUnit : 1.0 + aliasUnit;
      float edge1 = test ? radiusPart + aliasUnit : 1.0 - aliasUnit;
      float step = smoothstep(edge0, edge1, in_head ? head_dist : dist);
      float grey = gradient * step + (in_head ? 1.0 - step : 0.0);
      gl_FragColor = vec4(grey, grey, grey, 1.0);
    }`,
    ["position"],
    ["projMatrix", "aliasUnit"],
  );
  const buffers = initBuffersSpinner(squareShaderInfo.attribs);
  return {
    buffers: buffers,
    shaders: {
      square: squareShaderInfo,
    }
  };
}

var first_time; // First animation time
var last_time;  // Last animation time
var gl_state;
const projectionMatrix = Float32Array.from([
  1.0, 0.0,
  0.0, 1.0,
]);
const cameraDirection = Float32Array.from([0.0, 0.0, 1.0]);
// Adjust for antialiasing in an isotropic fashion.
// No mathematical basis, this was tuned to look good.
const unitAdjust = 1.55;

function animateSpinner(time) {
  requestAnimationFrame(animateSpinner);

  if (!first_time) {
    first_time = time;
  }
  if (time === last_time || !gl) {
    // Same frame, don't re-render.
    return;
  }
  last_time = time;

  gl.useProgram(gl_state.shaders.square.program);

  const width = innerWidth;
  const height = innerHeight;
  const scale = Math.min(height, width) * 0.28;
  if (width !== canvas.width || height !== canvas.height) {
    canvas.width = width;
    canvas.height = height;
    gl.uniform1f(gl_state.shaders.square.uniforms.aliasUnit, unitAdjust / scale);
    gl.viewport(0, 0, width, height);
  }

  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  const speed = 0.004;
  const cos = scale * Math.cos(speed * (time - first_time));
  const sin = scale * Math.sin(speed * (time - first_time));
  projectionMatrix[0] = cos / width;
  projectionMatrix[1] = sin / height;
  projectionMatrix[2] = -sin / width;
  projectionMatrix[3] = cos / height;
  gl.uniformMatrix2fv(
    gl_state.shaders.square.uniforms.projMatrix, false, projectionMatrix);
  vao_ext.bindVertexArrayOES(gl_state.buffers.vertex);
  gl.drawArrays(gl.TRIANGLE_FAN, 0, gl_state.buffers.vertexCount);
}

const error_text = document.getElementById("error_text");
const error_text2 = document.getElementById("error_text2");
if (gl === null) {
  error_text.replaceChildren("Can't create webgl context!");
  error_text2.innerHTML = `Webgl is supported by all modern browsers.<br>
Your browser is: <pre style="font-size:1vw">${navigator.userAgent}</pre>`;
} else if (vao_ext === null) {
  error_text.replaceChildren("VAO extension not supported!");
  error_text2.innerHTML = `Webgl is supported by all modern browsers.<br>
Your browser is: <pre style="font-size:1vw">${navigator.userAgent}</pre>`;
} else {
  canvas.style.display = "initial";
  error_text.style.display = "none";
  gl_state = initGLStateSpinner();
  requestAnimationFrame(animateSpinner);
}
