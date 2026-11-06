#pragma once
#include <array>
#include <cstdint>
#include <map>
#include <vector>
#include <glm/vec3.hpp>
#include <glm/vec2.hpp>

constexpr int CHUNK_SIZE = 16;
constexpr int WORLD_HEIGHT = 384;
enum Block : uint16_t { Air, Grass, Dirt, Stone, Sand, Wood, Leaves };
struct Vertex {
    glm::vec3 position;
    glm::vec3 normal;
    glm::vec3 color;
    glm::vec2 uv{};
};
struct Chunk {
    std::array<uint16_t, CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE> blocks{};
    std::vector<Vertex> vertices;
    std::vector<uint32_t> indices;
    bool dirty = true;
};
struct World {
    std::map<std::pair<int,int>, Chunk> chunks;
    explicit World(uint32_t seed = 317);
    uint16_t get(int x, int y, int z) const;
    void set(int x, int y, int z, uint16_t block);
    Chunk& ensure(int cx, int cz);
    void mesh(int cx, int cz);
    void save() const;
    void load();
    uint32_t seed;
};
struct Hit { bool found = false; glm::ivec3 block{}, adjacent{}; };
Hit raycast(const World& world, glm::vec3 origin, glm::vec3 direction, float reach);
