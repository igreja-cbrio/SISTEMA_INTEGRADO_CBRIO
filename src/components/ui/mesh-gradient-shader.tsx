// Mesh gradient animado (WebGL) · usado como fundo decorativo (ex.: hub do Kids).
// Self-contained · sem dependências além do React. Fallback de cor sólida se o
// WebGL não estiver disponível.
import React, { useEffect, useRef } from "react";

export interface MeshGradientProps {
  /** Animation speed multiplier. Default 10. */
  speed?: number;
  /** Color intensity. Default 2. */
  intensity?: number;
  /** Film grain amount. Default 0.75. */
  grain?: number;
  className?: string;
  style?: React.CSSProperties;
}

const VERT = "attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }";

const FRAG = [
  "precision highp float;",
  "uniform vec2 u_res; uniform float u_time; uniform float u_speed; uniform float u_intensity; uniform float u_grain;",
  "const vec3 C_PRIMARY = vec3(0.345,0.412,0.969);",
  "const vec3 C_ACCENT  = vec3(0.988,0.384,0.294);",
  "const vec3 C_PINK    = vec3(0.969,0.427,0.933);",
  "const vec3 C_MAGENTA = vec3(0.718,0.090,0.686);",
  "const vec3 C_DEEP    = vec3(0.102,0.102,0.369);",
  "float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123); }",
  "float grain(vec2 uv){ return hash(uv*vec2(1031.0,1973.0)+fract(u_time)); }",
  "void main(){",
  "  vec2 uv = gl_FragCoord.xy/u_res.xy;",
  "  float t = u_time*0.16*u_speed;",
  "  vec2 p0=vec2(0.24+0.18*sin(t*1.1), 0.30+0.14*cos(t*0.9));",
  "  vec2 p1=vec2(0.80+0.14*cos(t*0.8), 0.26+0.16*sin(t*1.2));",
  "  vec2 p2=vec2(0.56+0.20*sin(t*0.7), 0.76+0.12*cos(t*0.85));",
  "  vec2 p3=vec2(0.16+0.15*cos(t*1.3), 0.70+0.13*sin(t*0.75));",
  "  float e=1.9;",
  "  float w0=pow(1.0/(distance(uv,p0)+0.05),e);",
  "  float w1=pow(1.0/(distance(uv,p1)+0.05),e);",
  "  float w2=pow(1.0/(distance(uv,p2)+0.05),e);",
  "  float w3=pow(1.0/(distance(uv,p3)+0.05),e);",
  "  float ws=w0+w1+w2+w3;",
  "  vec3 col=(C_ACCENT*w0 + C_PINK*w1 + C_PRIMARY*w2 + C_MAGENTA*w3)/ws;",
  "  col = mix(col, vec3(1.000,0.549,0.259), 0.10*u_intensity*sin(t+uv.x*3.0));",
  "  col = mix(col, C_DEEP, smoothstep(0.45,1.15,uv.y)*0.16);",
  "  col += (grain(uv)-0.5)*0.04*u_grain;",
  "  gl_FragColor=vec4(col,1.0);",
  "}",
].join("\n");

export function MeshGradient({
  speed = 10,
  intensity = 2,
  grain = 0.75,
  className,
  style,
}: MeshGradientProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const paramsRef = useRef({ speed, intensity, grain });
  paramsRef.current = { speed, intensity, grain };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", { antialias: true, alpha: false });
    if (!gl) {
      canvas.style.background = "#5869f7";
      return;
    }

    function compile(type: number, src: string) {
      const s = gl!.createShader(type)!;
      gl!.shaderSource(s, src);
      gl!.compileShader(s);
      if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) {
        console.error(gl!.getShaderInfoLog(s));
      }
      return s;
    }

    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aLoc = gl.getAttribLocation(prog, "a");
    gl.enableVertexAttribArray(aLoc);
    gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, "u_res");
    const uTime = gl.getUniformLocation(prog, "u_time");
    const uSpeed = gl.getUniformLocation(prog, "u_speed");
    const uInt = gl.getUniformLocation(prog, "u_intensity");
    const uGrain = gl.getUniformLocation(prog, "u_grain");

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.floor(canvas!.clientWidth * dpr));
      const h = Math.max(1, Math.floor(canvas!.clientHeight * dpr));
      if (canvas!.width !== w || canvas!.height !== h) {
        canvas!.width = w;
        canvas!.height = h;
      }
    }
    window.addEventListener("resize", resize);

    const t0 = performance.now();
    let raf = 0;
    function frame() {
      resize();
      gl!.viewport(0, 0, gl!.drawingBufferWidth, gl!.drawingBufferHeight);
      gl!.uniform2f(uRes, gl!.drawingBufferWidth, gl!.drawingBufferHeight);
      gl!.uniform1f(uTime, (performance.now() - t0) / 1000);
      const p = paramsRef.current;
      gl!.uniform1f(uSpeed, p.speed);
      gl!.uniform1f(uInt, p.intensity);
      gl!.uniform1f(uGrain, p.grain);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", ...style }}
    />
  );
}

export default MeshGradient;
