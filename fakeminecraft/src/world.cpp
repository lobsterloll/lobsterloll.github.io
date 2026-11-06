#include "world.hpp"
#include <algorithm>
#include <cmath>
#include <fstream>
#include <glm/geometric.hpp>

namespace {
int floor_div(int n) { return n >= 0 ? n / CHUNK_SIZE : (n - CHUNK_SIZE + 1) / CHUNK_SIZE; }
int index(int x, int y, int z) { return (y * CHUNK_SIZE + z) * CHUNK_SIZE + x; }
uint32_t hash(int x, int z, uint32_t seed) {
    uint32_t n = uint32_t(x) * 0x9e3779b9u ^ uint32_t(z) * 0x85ebca6bu ^ seed;
    n ^= n >> 16; n *= 0x7feb352du; n ^= n >> 15; n *= 0x846ca68bu; return n ^ (n >> 16);
}
float noise(float x, float z, uint32_t seed) {
    int ix = int(std::floor(x)), iz = int(std::floor(z));
    float u = x - ix, v = z - iz;
    u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
    auto sample = [&](int a, int b) { return float(hash(a,b,seed) & 0xffff) / 65535.0f; };
    float a = std::lerp(sample(ix,iz), sample(ix+1,iz), u);
    float b = std::lerp(sample(ix,iz+1), sample(ix+1,iz+1), u);
    return std::lerp(a,b,v);
}
constexpr int normal[6][3] = {{1,0,0},{-1,0,0},{0,1,0},{0,-1,0},{0,0,1},{0,0,-1}};
constexpr int uvCorner[4][2] = {{0,1},{0,0},{1,0},{1,1}};
constexpr int corner[6][4][3] = {
    {{1,0,0},{1,1,0},{1,1,1},{1,0,1}},
    {{0,0,1},{0,1,1},{0,1,0},{0,0,0}},
    {{0,1,1},{1,1,1},{1,1,0},{0,1,0}},
    {{0,0,0},{1,0,0},{1,0,1},{0,0,1}},
    {{1,0,1},{1,1,1},{0,1,1},{0,0,1}},
    {{0,0,0},{0,1,0},{1,1,0},{1,0,0}}
};
}

World::World(uint32_t s) : seed(s) { load(); }
uint16_t World::get(int x, int y, int z) const {
    if (y < 0) return Stone;
    if (y >= WORLD_HEIGHT) return Air;
    auto it = chunks.find({floor_div(x), floor_div(z)});
    if (it == chunks.end()) return Air;
    return it->second.blocks[index(x - floor_div(x)*CHUNK_SIZE, y, z - floor_div(z)*CHUNK_SIZE)];
}
Chunk& World::ensure(int cx, int cz) {
    auto [it, inserted] = chunks.try_emplace({cx,cz});
    if (!inserted) return it->second;
    for (auto neighbor : {std::pair{cx-1,cz},std::pair{cx+1,cz},std::pair{cx,cz-1},std::pair{cx,cz+1}})
        if (auto adjacent=chunks.find(neighbor); adjacent!=chunks.end()) adjacent->second.dirty=true;
    Chunk& chunk = it->second;
    for (int z=0; z<CHUNK_SIZE; ++z) for (int x=0; x<CHUNK_SIZE; ++x) {
        int wx = cx*CHUNK_SIZE+x, wz = cz*CHUNK_SIZE+z;
        float h = noise(wx/90.f,wz/90.f,seed)*24.f + noise(wx/27.f,wz/27.f,seed+1)*10.f + noise(wx/9.f,wz/9.f,seed+2)*3.f;
        int top = 42 + int(h);
        for (int y=0; y<=top; ++y)
            chunk.blocks[index(x,y,z)] = y==top ? (top<51 ? Sand : Grass) : (y>top-4 ? Dirt : Stone);
    }
    return chunk;
}
void World::set(int x, int y, int z, uint16_t block) {
    if (y<0 || y>=WORLD_HEIGHT) return;
    int cx=floor_div(x), cz=floor_div(z);
    Chunk& c=ensure(cx,cz);
    c.blocks[index(x-cx*CHUNK_SIZE,y,z-cz*CHUNK_SIZE)] = block;
    c.dirty=true;
    if (x-cx*CHUNK_SIZE==0) if (auto it=chunks.find({cx-1,cz}); it!=chunks.end()) it->second.dirty=true;
    if (x-cx*CHUNK_SIZE==15) if (auto it=chunks.find({cx+1,cz}); it!=chunks.end()) it->second.dirty=true;
    if (z-cz*CHUNK_SIZE==0) if (auto it=chunks.find({cx,cz-1}); it!=chunks.end()) it->second.dirty=true;
    if (z-cz*CHUNK_SIZE==15) if (auto it=chunks.find({cx,cz+1}); it!=chunks.end()) it->second.dirty=true;
}
void World::mesh(int cx, int cz) {
    Chunk& chunk=ensure(cx,cz);
    chunk.vertices.clear(); chunk.indices.clear();
    for (int y=0; y<WORLD_HEIGHT; ++y) for (int z=0; z<CHUNK_SIZE; ++z) for (int x=0; x<CHUNK_SIZE; ++x) {
        int wx=cx*CHUNK_SIZE+x, wz=cz*CHUNK_SIZE+z;
        uint16_t id=chunk.blocks[index(x,y,z)];
        if (id==Air) continue;
        for (int face=0; face<6; ++face) {
            auto& n=normal[face];
            if (get(wx+n[0],y+n[1],wz+n[2])!=Air) continue;
            uint32_t base=uint32_t(chunk.vertices.size());
            int tile=int(id)-1;
            if (id==Grass) tile=face==2 ? 0 : (face==3 ? 1 : 1523);
            float u0=(float((tile%32)*16)+.5f)/512.f, u1=(float((tile%32+1)*16)-.5f)/512.f;
            float v0=(float((tile/32)*16)+.5f)/768.f, v1=(float((tile/32+1)*16)-.5f)/768.f;
            for (int v=0; v<4; ++v) {
                auto& p=corner[face][v];
                glm::vec3 color{1.f};
                int occupied=0;
                for (int a=-1; a<=1; ++a) for (int b=-1; b<=1; ++b) {
                    if (a==0 && b==0) continue;
                    int sx=wx+p[0]+(face<2?0:a), sy=y+p[1]+(face>=2&&face<4?0:a), sz=wz+p[2]+(face>=4?0:b);
                    occupied += get(sx,sy,sz)!=Air;
                }
                color *= 1.f - .025f*occupied;
                glm::vec2 uv{uvCorner[v][0] ? u1 : u0,uvCorner[v][1] ? v1 : v0};
                chunk.vertices.push_back({{float(wx+p[0]),float(y+p[1]),float(wz+p[2])},{float(n[0]),float(n[1]),float(n[2])},color,uv});
            }
            for (uint32_t i : {0u,1u,2u,0u,2u,3u}) chunk.indices.push_back(base+i);
        }
    }
    chunk.dirty=false;
}
void World::save() const {
    std::ofstream out("stonefield.save",std::ios::binary|std::ios::trunc);
    uint32_t magic=0x53464c44, count=uint32_t(chunks.size());
    out.write(reinterpret_cast<const char*>(&magic),4); out.write(reinterpret_cast<const char*>(&seed),4); out.write(reinterpret_cast<const char*>(&count),4);
    for (auto& [key,chunk] : chunks) {
        out.write(reinterpret_cast<const char*>(&key.first),4); out.write(reinterpret_cast<const char*>(&key.second),4);
        out.write(reinterpret_cast<const char*>(chunk.blocks.data()),chunk.blocks.size()*sizeof(uint16_t));
    }
}
void World::load() {
    std::ifstream in("stonefield.save",std::ios::binary);
    uint32_t magic=0,count=0;
    in.read(reinterpret_cast<char*>(&magic),4);
    if (magic!=0x53464c44) return;
    in.read(reinterpret_cast<char*>(&seed),4); in.read(reinterpret_cast<char*>(&count),4);
    if (!in || count>10000) return;
    for (uint32_t i=0; i<count; ++i) {
        int cx,cz; in.read(reinterpret_cast<char*>(&cx),4); in.read(reinterpret_cast<char*>(&cz),4);
        Chunk chunk; in.read(reinterpret_cast<char*>(chunk.blocks.data()),chunk.blocks.size()*sizeof(uint16_t));
        if (!in) { chunks.clear(); return; }
        chunks.emplace(std::pair{cx,cz},std::move(chunk));
    }
}
Hit raycast(const World& world, glm::vec3 origin, glm::vec3 direction, float reach) {
    glm::ivec3 cell=glm::floor(origin), previous=cell;
    glm::ivec3 step;
    glm::vec3 delta, next;
    for (int a=0; a<3; ++a) {
        step[a]=direction[a]>0 ? 1 : -1;
        delta[a]=direction[a]==0 ? INFINITY : std::abs(1.f/direction[a]);
        next[a]=direction[a]==0 ? INFINITY : ((step[a]>0 ? cell[a]+1.f-origin[a] : origin[a]-cell[a])*delta[a]);
    }
    float distance=0;
    while (distance<=reach) {
        if (world.get(cell.x,cell.y,cell.z)!=Air) return {true,cell,previous};
        previous=cell;
        int axis=next.x<next.y ? (next.x<next.z?0:2) : (next.y<next.z?1:2);
        distance=next[axis]; next[axis]+=delta[axis]; cell[axis]+=step[axis];
    }
    return {};
}
