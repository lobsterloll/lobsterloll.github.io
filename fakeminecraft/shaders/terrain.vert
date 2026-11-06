#version 450
layout(location=0) in vec3 inPosition;
layout(location=1) in vec3 inNormal;
layout(location=2) in vec3 inColor;
layout(location=3) in vec2 inUV;
layout(location=0) out vec3 color;
layout(location=1) out vec2 uv;
layout(push_constant) uniform Camera { mat4 viewProjection; } camera;
void main() {
    gl_Position = camera.viewProjection * vec4(inPosition, 1.0);
    float light = clamp(dot(normalize(inNormal), normalize(vec3(0.6,1.0,0.35))) * 0.45 + 0.55, 0.25, 1.0);
    color = inColor * light;
    uv = inUV;
}
