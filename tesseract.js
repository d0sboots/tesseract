"use strict";

const canvas = document.getElementById("canvas");
const gl = canvas.getContext("webgl", {antialias: true});
const vao_ext = gl.getExtension("OES_vertex_array_object");

var first_time; // First animation time
var last_time;  // Last animation time
var gl_state;   // Object containing *all* the persistent GL state
const modelMatrix = Float32Array.from([
  1.0, 0.0, 0.0,
  0.0, 1.0, 0.0,
  0.0, 0.0, 1.0,
]);

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

// Add a single polygon to the vertex and index arrays in "buffers".
// The color of the entire polygon is the 32-bit RGBA uint "color", in
// little-endian format, so 0x000000FF is red.
// The vertices are specified as x,y,z triples in "points", packed in that
// order. The polygon should be planar, and normals will be calculated
// assuming CCW winding and equal normals for all vertices.
// The output is 20-byte interleaved vertex data, with 12 bytes of float
// positions, 3 bytes of uint8 normals, 1 byte padding, and 4 bytes of uint8 color.
// The index buffer is 6 bytes per triangle, 3 uint16 indices each. There will
// be a total of len(points) - 6 indices added.
function addPolygon(buffers, color, points) {
  color = color | 0;
  const v0x = points[3] - points[0];
  const v0y = points[4] - points[1];
  const v0z = points[5] - points[2];
  const v1x = points[6] - points[0];
  const v1y = points[7] - points[1];
  const v1z = points[8] - points[2];
  const cross = [
    v0y * v1z - v1y * v0z,
    v0z * v1x - v1z * v0x,
    v0x * v1y - v1x * v0y];
  const max_ind = Math.abs(cross[0]) > Math.abs(cross[1]) ?
    (Math.abs(cross[0]) > Math.abs(cross[2]) ? 0 : 2) :
    (Math.abs(cross[1]) > Math.abs(cross[2]) ? 1 : 2);
  const scale = 1.0 / Math.abs(cross[max_ind]);
  const nx = Math.round((cross[0] * scale + 1.0) * 127.5);
  const ny = Math.round((cross[1] * scale + 1.0) * 127.5);
  const nz = Math.round((cross[2] * scale + 1.0) * 127.5);
  const normal = nx | (ny << 8) | (nz << 16);
  const norm_color = [normal, color];

  const floatBuffer = new Float32Array(buffers.vertexArray);
  const uint32Buffer = new Uint32Array(buffers.vertexArray);
  const index0 = buffers.vertexCount;

  for (var i = 0; i < (points.length / 3) | 0; i++) {
    floatBuffer.set(points.slice(i*3, i*3 + 3), buffers.vertexCount * 5);
    uint32Buffer.set(norm_color, buffers.vertexCount * 5 + 3);
    if (i > 1) {
      buffers.indexArray.set([index0, buffers.vertexCount - 1, buffers.vertexCount], buffers.indexCount);
      buffers.indexCount += 3;
    }
    buffers.vertexCount++;
  }
}

// Initializes and returns the "buffers" object, which encapsulates all the
// info about the vertex and index buffers, both for the GL objects and the JS
// buffer objects that we use to push data into the GL buffers, and keep
// around to avoid reallocations. The VAO also lives here.
// Currently, model geometry is created here, because it is static. This will
// change when that becomes dynamic.
function initBuffers(squareAttribs) {
  const vao = vao_ext.createVertexArrayOES();
  vao_ext.bindVertexArrayOES(vao);

  const vertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);

  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);

  const stride = 20;
  const vertexArray = new ArrayBuffer(stride * 64);
  const indexArray = new Uint16Array(128);

  const buffers = {
    vao: vao,
    vbo: vertexBuffer,
    indexBuffer: indexBuffer,
    vertexArray: vertexArray,
    indexArray: indexArray,
    vertexCount: 0,
    indexCount: 0,
  };

  addPolygon(buffers, 0x000000FF, [
    -1, -1,  1,
     1, -1,  1,
     1,  1,  1,
    -1,  1,  1,
  ]);
  addPolygon(buffers, 0x000000FF, [
    -1,  1, -1,
     1,  1, -1,
     1, -1, -1,
    -1, -1, -1,
  ]);
  addPolygon(buffers, 0x0000FF00, [
    -1,  1, -1,
    -1,  1,  1,
     1,  1,  1,
     1,  1, -1,
  ]);
  addPolygon(buffers, 0x0000FF00, [
     1, -1, -1,
     1, -1,  1,
    -1, -1,  1,
    -1, -1, -1,
  ]);
  addPolygon(buffers, 0x00FF0000, [
     1,  1, -1,
     1,  1,  1,
     1, -1,  1,
     1, -1, -1,
  ]);
  addPolygon(buffers, 0x00FF0000, [
    -1, -1, -1,
    -1, -1,  1,
    -1,  1,  1,
    -1,  1, -1,
  ]);

  var numComponents = 3;
  var type = gl.FLOAT;
  var normalize = false;
  var offset = 0;
  gl.vertexAttribPointer(squareAttribs.position, numComponents, type, normalize, stride, offset);

  numComponents = 4;
  type = gl.BYTE;
  normalize = true;
  offset = 12;
  gl.vertexAttribPointer(squareAttribs.normal, numComponents, type, normalize, stride, offset);

  type = gl.UNSIGNED_BYTE;
  offset = 16;
  gl.vertexAttribPointer(squareAttribs.color, numComponents, type, normalize, stride, offset);

  gl.bufferData(gl.ARRAY_BUFFER, vertexArray, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexArray, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(squareAttribs.position);
  gl.enableVertexAttribArray(squareAttribs.normal);
  gl.enableVertexAttribArray(squareAttribs.color);
  vao_ext.bindVertexArrayOES(null);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
  return buffers;
}

// Initializes all the GL state, returning the gl_state object.
// This includes shaders and buffers.
function initGLState() {
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.clearDepth(1.0);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.CULL_FACE);

  const squareShaderInfo = initShaderProgram(
   `attribute vec3 position;
    attribute vec3 normal;
    attribute vec3 color;

    varying vec3 normal_frag;
    varying vec3 color_frag;
    uniform mat3 modelMatrix;
    uniform vec3 projVector;

    void main() {
      const float view = 1.75;
      vec3 pos = modelMatrix * position;
      vec3 proj = projVector * pos;
      gl_Position = vec4(proj.xy, proj.z + view, -view*projVector.z - pos.z);
      color_frag = color;
      normal_frag = normal;
    }`,

    // Simple Blinn-Phong with a single light fixed at the camera position
   `precision highp float;

    varying vec3 normal_frag;
    varying vec3 color_frag;

    void main() {
      gl_FragColor = vec4(color_frag, 1.0);
    }`,
    ["position", "normal", "color"],
    ["projVector", "modelMatrix"],
  );
  const buffers = initBuffers(squareShaderInfo.attribs);
  return {
    buffers: buffers,
    shaders: {
      square: squareShaderInfo,
    }
  };
}

// Construct the rotation matrix based on elapsed time.
function makeRotation(time) {
  // We use a quaternion rotation, where each component is a sinusoid with
  // different periods. This gives a wobbly, twisty rotation that never
  // repeats.
  const w = Math.cos(0.00059 * time);
  const x = Math.sin(0.00097 * time);
  const y = Math.sin(0.00071 * time);
  const z = Math.sin(0.00083 * time);
  const ww = w * w, xx = x * x, yy = y * y, zz = z * z;
  const s = 2 / (ww + xx + yy + zz);
  const wx = w * x, wy = w * y, wz = w * z;
  const xy = x * y, xz = x * z;
  const yz = y * z;
  modelMatrix[0] = 1 - s * (yy + zz);
  modelMatrix[1] = s * (xy - wz);
  modelMatrix[2] = s * (xz + wy);
  modelMatrix[3] = s * (xy + wz);
  modelMatrix[4] = 1 - s * (xx + zz);
  modelMatrix[5] = s * (yz - wx);
  modelMatrix[6] = s * (xz - wy);
  modelMatrix[7] = s * (yz + wx);
  modelMatrix[8] = 1 - s * (xx + yy);
}

// The render loop. This is the callback fired from requestAnimationFrame(),
// which re-queues itself.
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
  const scale = Math.min(height, width);
  const fov = 1 / Math.tan(35 / 2 * Math.PI / 180);
  if (width !== canvas.width || height !== canvas.height) {
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);
  }

  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  makeRotation(time - first_time);
  const projVx = fov * scale / width;
  const projVy = fov * scale / height;
  const projVz = -fov;
  gl.uniformMatrix3fv(
    gl_state.shaders.square.uniforms.modelMatrix, false, modelMatrix);
  gl.uniform3f(
    gl_state.shaders.square.uniforms.projVector, projVx, projVy, projVz);
  vao_ext.bindVertexArrayOES(gl_state.buffers.vao);
  gl.drawElements(gl.TRIANGLES, gl_state.buffers.indexCount, gl.UNSIGNED_SHORT, 0);
}

// Final global init and startup.
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
