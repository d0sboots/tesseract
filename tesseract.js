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

function initBuffers(squareAttribs) {
  const vao = vao_ext.createVertexArrayOES();
  vao_ext.bindVertexArrayOES(vao);

  const vertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);

  // TRIANGLE_STRIP data, vec3 vertex + (i8) vec3 normal + pad, (u8) vec3 color + pad
  const vertexData = [
     1.05, -1.05, 0.0, 0x00, 0x7F, 0x7F, 0, 0xFF, 0x0, 0x0, 0x0,
     1.05,  1.05, 0.0, 0x00, 0x7F, 0x7F, 0, 0xFF, 0x0, 0x0, 0x0,
    -1.05, -1.05, 0.0, 0x00, 0x7F, 0x7F, 0, 0xFF, 0x0, 0x0, 0x0,
    -1.05,  1.05, 0.0, 0x00, 0x7F, 0x7F, 0, 0xFF, 0x0, 0x0, 0x0,
  ];

  const stride = 20;
  const elements = 4;
  const vertexArray = new ArrayBuffer(stride * elements);

  var numComponents = 3;
  var type = gl.FLOAT;
  var normalize = false;
  var offset = 0;
  const floatBuffer = new Float32Array(vertexArray)
  gl.vertexAttribPointer(squareAttribs.position, numComponents, type, normalize, stride, offset);
  for (var i = 0; i < elements; i++) {
    floatBuffer.set(vertexData.slice(i*11, i*11 + 3), i * 5)
  }

  numComponents = 4;
  type = gl.BYTE;
  normalize = true;
  offset = 12;
  const int8Buffer = new Int8Array(vertexArray)
  gl.vertexAttribPointer(squareAttribs.normal, numComponents, type, normalize, stride, offset);
  for (var i = 0; i < elements; i++) {
    int8Buffer.set(vertexData.slice(i*11 + 3, i*11 + 7), i * 20 + 12)
  }

  type = gl.UNSIGNED_BYTE;
  normalize = true;
  offset = 16;
  const uint8Buffer = new Uint8Array(vertexArray)
  gl.vertexAttribPointer(squareAttribs.color, numComponents, type, normalize, stride, offset);
  for (var i = 0; i < elements; i++) {
    uint8Buffer.set(vertexData.slice(i*11 + 7, i*11 + 11), i * 20 + 16)
  }

  gl.bufferData(gl.ARRAY_BUFFER, vertexArray, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  gl.enableVertexAttribArray(squareAttribs.position);
  gl.enableVertexAttribArray(squareAttribs.normal);
  gl.enableVertexAttribArray(squareAttribs.color);
  vao_ext.bindVertexArrayOES(null);

  return {
    vao: vao,
    vbo: vertexBuffer,
    vertexData: vertexData,
    vertexArray: vertexArray,
    vertexCount: elements,
  };
}

function initGLState() {
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.clearDepth(1.0);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);

  const squareShaderInfo = initShaderProgram(
   `attribute vec3 position;
    attribute vec3 normal;
    attribute vec3 color;

    varying vec3 normal_frag;
    varying vec3 color_frag;
    uniform mat2 projMatrix;

    void main() {
      gl_Position = vec4(projMatrix * vec2(position), 0.0, 1.0);
      color_frag = color;
      normal_frag = normal;
    }`,

   `precision highp float;

    varying vec3 normal_frag;
    varying vec3 color_frag;

    void main() {
      gl_FragColor = vec4(color_frag, 1.0);
    }`,
    ["position", "normal", "color"],
    ["projMatrix"],
  );
  const buffers = initBuffers(squareShaderInfo.attribs);
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

function animate(time) {
  requestAnimationFrame(animate);

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
  vao_ext.bindVertexArrayOES(gl_state.buffers.vao);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, gl_state.buffers.vertexCount);
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
  gl_state = initGLState();
  requestAnimationFrame(animate);
}
