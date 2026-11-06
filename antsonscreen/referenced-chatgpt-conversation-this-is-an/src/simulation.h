#pragma once

#include <cstddef>
#include <cstdint>
#include <random>
#include <vector>

namespace ants {

struct Vec2 {
    float x = 0;
    float y = 0;
};

struct Rect {
    float left = 0;
    float top = 0;
    float right = 0;
    float bottom = 0;
};

enum class State { roaming, biting, attached, fleeing };

struct Ant {
    Vec2 position;
    Vec2 velocity;
    Vec2 attachOffset;
    float heading = 0;
    float legPhase = 0;
    float size = 1;
    float stateTime = 0;
    float cooldown = 0;
    float wanderTime = 0;
    bool cursorInterested = false;
    bool clockwise = false;
    bool edgeContact = false;
    State state = State::roaming;
};

class Simulation {
public:
    Simulation(float width, float height, std::size_t count = 250, std::uint32_t seed = 0xA17u);
    void step(float dt, Vec2 cursor, const std::vector<Rect>& windows);
    const std::vector<Ant>& ants() const { return ants_; }
    float width() const { return width_; }
    float height() const { return height_; }
    void resize(float width, float height);

private:
    float random(float low, float high);
    float width_;
    float height_;
    std::mt19937 rng_;
    std::vector<Ant> ants_;
    Vec2 previousCursor_;
    bool hasCursor_ = false;
};

} // namespace ants
