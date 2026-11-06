#version 450
layout(location=0) in vec3 inPosition;
layout(location=2) in vec3 inColor;
layout(location=0) out vec3 color;
layout(push_constant) uniform Camera { mat4 viewProjection; } camera;
void main() {
    gl_Position = camera.viewProjection * vec4(inPosition, 1.0);
    color = inColor;
}
