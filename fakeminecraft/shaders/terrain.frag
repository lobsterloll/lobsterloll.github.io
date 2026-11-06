#version 450
layout(location=0) in vec3 color;
layout(location=1) in vec2 uv;
layout(location=0) out vec4 outColor;
layout(set=0,binding=0) uniform sampler2D atlas;
void main() { outColor = vec4(texture(atlas, uv).rgb * color, 1.0); }
