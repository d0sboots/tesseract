"use strict";

const canvas = document.getElementById("canvas");
const gl = canvas.getContext("webgl", {antialias: true});
const vao_ext = gl.getExtension("OES_vertex_array_object");

var first_time; // First animation time
var last_time;  // Last animation time
var gl_state;   // Object containing *all* the persistent GL state
var last_x, last_y;  // The mouse coords as of the last frame
var curr_x, curr_y;  // The current mouse coords
var throw_state = -1;  // Are we dragging/in throw mode?
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
    if (attribsResult[a] < 0) {
      console.log('Attrib ' + a + ' not found!');
    }
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
  const scale = 127.5 / Math.abs(cross[max_ind]);
  const nx = Math.round(cross[0] * scale - .5) & 0xFF;
  const ny = Math.round(cross[1] * scale - .5) & 0xFF;
  const nz = Math.round(cross[2] * scale - .5) & 0xFF;
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

  addPolygon(buffers, 0x000A0AFF, [
    -1, -1,  1,
     1, -1,  1,
     1,  1,  1,
    -1,  1,  1,
  ]);
  addPolygon(buffers, 0x000A0AFF, [
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
  addPolygon(buffers, 0x00FF0808, [
     1,  1, -1,
     1,  1,  1,
     1, -1,  1,
     1, -1, -1,
  ]);
  addPolygon(buffers, 0x00FF0808, [
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
    varying vec3 pos_frag;
    uniform mat3 modelMatrix;
    uniform vec3 projVector;

    void main() {
      const float view = 1.75;
      pos_frag = modelMatrix * position;
      vec3 proj = projVector * pos_frag;
      gl_Position = vec4(proj.xy, proj.z + view, -view*projVector.z - pos_frag.z);
      color_frag = color;
      //normal_frag = normal;
      normal_frag = modelMatrix * normal;
    }`,

    // Use isotropic New Ward with a single light fixed at the camera position
    // Algorithm comes from https://gamedev.stackexchange.com/questions/185168/
   `precision highp float;

    varying vec3 pos_frag;
    varying vec3 normal_frag;
    varying vec3 color_frag;

    void main() {
      const float ambientPower = .15;
      const float diffusePower = .75;
      const float shiny = 0.2;
      const float alpha = .40;
      const float PI = 3.14159265359;
      const vec3 gamma = vec3(2.2);
      const float invAlpha2 = 1.0 / (alpha * alpha);
      // Would move this computation to CPU and pass invAlpha2 as uniform if alpha were a parameter
      const float cFactor = invAlpha2 / PI;

      // Lighting calculations happen in eye space. We get interpolated model
      // coords from pos_frag, and have to translate to get eye coords.
      // The depth value will exactly equal the "w" value, so we can use
      // gl_FragCoord for this purpose.
      vec3 eyeNormal = normalize(vec3(pos_frag.xy, 1.0 / gl_FragCoord.w));
      // For now, the light source is the camera.
      vec3 lightNormal = eyeNormal;
      // Note this is *unnormalized*.
      vec3 halfway = lightNormal + eyeNormal;
      float dotP = dot(halfway, normal_frag);
      float invDot2 = 1.0 / (dotP * dotP);
      float semiNormalizedInvDot = dot(halfway, halfway) * invDot2;
      // Note: You can't factor the exp(invAlpha2) part out as a constant term,
      // you'll blow out the floating-point range if you try.
      float specular = cFactor * exp(invAlpha2-invAlpha2*semiNormalizedInvDot) * semiNormalizedInvDot * invDot2;

      float diffuse = dot(lightNormal, normal_frag);
      diffuse = max(0.0, diffuse);
      vec3 colorPre = (ambientPower + diffusePower * diffuse) * color_frag + vec3(specular * shiny * diffuse);

      // No way to bind an SRGB framebuffer in WebGL, we have to do gamma
      // correction ourselves.
      gl_FragColor = vec4(pow(colorPre, gamma), 1.0);
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
function makeDemoRotation(time) {
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

function applyMouseRotation(scale, dt) {
  const speed = (-1.4 / scale) * (throw_state == 0 ? 1 : throw_state);
  throw_state *= Math.exp(-dt * .004)
  const dy = (curr_x - last_x) * speed;
  const dx = (curr_y - last_y) * speed;
  // We use a quaternion rotation, where w = 1, z = 0.
  // Because sin x ~= x for small angles, this works as a linear approximation
  // to rotations on a per-frame basis, but doesn't fail badly for huge
  // motions.
  const xx = dx * dx, yy = dy * dy;
  const xy = dx * dy;
  const s = 2 / (1 + xx + yy);
  const mm0 = 1 - s * yy;
  const mm1 = s * xy;
  const mm2 = s * dy;
  const mm3 = s * xy;
  const mm4 = 1 - s * xx;
  const mm5 = s * -dx;
  const mm6 = s * -dy;
  const mm7 = s * dx;
  const mm8 = 1 - s * (xx + yy);
  // Time to hand-code matrix multiplication, because why not
  const temp0    = modelMatrix[0] * mm0 + modelMatrix[1] * mm3 + modelMatrix[2] * mm6;
  const temp1    = modelMatrix[0] * mm1 + modelMatrix[1] * mm4 + modelMatrix[2] * mm7;
  modelMatrix[2] = modelMatrix[0] * mm2 + modelMatrix[1] * mm5 + modelMatrix[2] * mm8;
  modelMatrix[0] = temp0;
  modelMatrix[1] = temp1;
  const temp3    = modelMatrix[3] * mm0 + modelMatrix[4] * mm3 + modelMatrix[5] * mm6;
  const temp4    = modelMatrix[3] * mm1 + modelMatrix[4] * mm4 + modelMatrix[5] * mm7;
  modelMatrix[5] = modelMatrix[3] * mm2 + modelMatrix[4] * mm5 + modelMatrix[5] * mm8;
  modelMatrix[3] = temp3;
  modelMatrix[4] = temp4;
  const temp6    = modelMatrix[6] * mm0 + modelMatrix[7] * mm3 + modelMatrix[8] * mm6;
  const temp7    = modelMatrix[6] * mm1 + modelMatrix[7] * mm4 + modelMatrix[8] * mm7;
  modelMatrix[8] = modelMatrix[6] * mm2 + modelMatrix[7] * mm5 + modelMatrix[8] * mm8;
  modelMatrix[6] = temp6;
  modelMatrix[7] = temp7;
  if (throw_state == 0) {
    last_x = curr_x;
    last_y = curr_y;
  }
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
  const dt = time - last_time;
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
  if (throw_state < 0) {
    makeDemoRotation(time - first_time);
  } else {
    applyMouseRotation(scale, dt);
  }
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

function onDown(e) {
  if (e.button !== 0)
    return;
  canvas.onpointermove = onDrag;
  canvas.setPointerCapture(e.pointerId);
  last_x = e.x;
  last_y = e.y;
  curr_x = last_x;
  curr_y = last_y;
  throw_state = 0;
  e.preventDefault();
}

function onUp(e) {
  if (canvas.onpointermove == null)
    return;
  canvas.onpointermove = null;
  canvas.releasePointerCapture(e.pointerId);
  curr_x = e.x;
  curr_y = e.y;
  throw_state = 1.0;
  e.preventDefault();
}

function onDrag(e) {
  curr_x = e.x;
  curr_y = e.y;
  e.preventDefault();
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
  canvas.onpointerdown = onDown;
  canvas.onpointerup = onUp;
  error_text.style.display = "none";
  gl_state = initGLState();
  requestAnimationFrame(animate);
}
