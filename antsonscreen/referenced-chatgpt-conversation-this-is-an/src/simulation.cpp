#include "simulation.h"

#include <algorithm>
#include <cmath>

namespace ants {
namespace {
constexpr float kPi = 3.14159265358979323846f;
Vec2 operator+(Vec2 a, Vec2 b) { return {a.x + b.x, a.y + b.y}; }
Vec2 operator-(Vec2 a, Vec2 b) { return {a.x - b.x, a.y - b.y}; }
Vec2 operator*(Vec2 a, float s) { return {a.x * s, a.y * s}; }
float length(Vec2 a) { return std::sqrt(a.x * a.x + a.y * a.y); }
Vec2 unit(Vec2 a) { const float n = length(a); return n > 0.001f ? a * (1.0f / n) : Vec2{}; }
Vec2 limit(Vec2 a, float maxLength) { const float n = length(a); return n > maxLength ? a * (maxLength / n) : a; }
}

float Simulation::random(float low, float high) {
    return std::uniform_real_distribution<float>(low, high)(rng_);
}

Simulation::Simulation(float width, float height, std::size_t count, std::uint32_t seed)
    : width_(std::max(1.0f, width)), height_(std::max(1.0f, height)), rng_(seed) {
    ants_.reserve(count);
    for (std::size_t i = 0; i < count; ++i) {
        Ant a;
        a.position = {random(0, width_), random(0, height_)};
        a.heading = random(-kPi, kPi);
        a.velocity = {std::cos(a.heading) * random(15, 35), std::sin(a.heading) * random(15, 35)};
        a.size = random(0.82f, 1.22f);
        a.legPhase = random(0, 2 * kPi);
        a.wanderTime = random(0, 0.5f);
        a.cursorInterested = (i % 3 == 0); // Only a minority pursue the pointer.
        a.clockwise = (i % 2 == 0);
        ants_.push_back(a);
    }
}

void Simulation::resize(float width, float height) {
    width_ = std::max(1.0f, width);
    height_ = std::max(1.0f, height);
    for (auto& a : ants_) {
        a.position.x = std::clamp(a.position.x, 0.0f, width_);
        a.position.y = std::clamp(a.position.y, 0.0f, height_);
    }
}

void Simulation::step(float dt, Vec2 cursor, const std::vector<Rect>& windows) {
    dt = std::clamp(dt, 0.0f, 0.05f);
    if (dt == 0) return;
    const Vec2 cursorVelocity = hasCursor_ ? (cursor - previousCursor_) * (1.0f / dt) : Vec2{};
    const float cursorSpeed = length(cursorVelocity);
    previousCursor_ = cursor;
    hasCursor_ = true;

    // Neighbor data is read from the previous frame so iteration order does not bias flocking.
    std::vector<Vec2> oldPositions;
    std::vector<Vec2> oldVelocities;
    oldPositions.reserve(ants_.size());
    oldVelocities.reserve(ants_.size());
    for (const auto& a : ants_) { oldPositions.push_back(a.position); oldVelocities.push_back(a.velocity); }

    for (std::size_t i = 0; i < ants_.size(); ++i) {
        Ant& a = ants_[i];
        a.edgeContact = false;
        a.stateTime += dt;
        a.cooldown = std::max(0.0f, a.cooldown - dt);
        a.legPhase += dt * (11.0f + length(a.velocity) * 0.10f);

        if (a.state == State::attached) {
            a.position = cursor + a.attachOffset; // Follows the sampled real OS pointer.
            a.velocity = cursorVelocity;
            a.heading = std::atan2(-a.attachOffset.y, -a.attachOffset.x);
            if (cursorSpeed > 900.0f || a.stateTime > 3.0f) {
                a.state = State::fleeing;
                a.stateTime = 0;
                a.cooldown = 2.0f;
                a.velocity = limit(cursorVelocity * 0.25f + unit(a.attachOffset) * 60.0f, 240.0f);
            }
            continue;
        }

        const Vec2 toCursor = cursor - a.position;
        const float cursorDistance = length(toCursor);
        if (a.state == State::biting) {
            a.velocity = limit(a.velocity + unit(toCursor) * (450.0f * dt), 100.0f);
            a.position = a.position + a.velocity * dt;
            a.heading = std::atan2(toCursor.y, toCursor.x);
            if (a.stateTime >= 0.20f) {
                if (cursorDistance < 22.0f && cursorSpeed < 700.0f) {
                    a.state = State::attached;
                    a.attachOffset = unit(a.position - cursor) * std::clamp(cursorDistance, 7.0f, 14.0f);
                    a.position = cursor + a.attachOffset;
                } else {
                    a.state = State::fleeing;
                    a.cooldown = 1.5f;
                }
                a.stateTime = 0;
            }
            continue;
        }

        if (a.state == State::fleeing && a.stateTime > 0.7f) {
            a.state = State::roaming;
            a.stateTime = 0;
        }
        if (a.cursorInterested && a.cooldown == 0 && cursorDistance < 13.0f && cursorSpeed < 700.0f) {
            a.state = State::biting;
            a.stateTime = 0;
            continue;
        }

        a.wanderTime -= dt;
        if (a.wanderTime <= 0) {
            a.heading += random(-0.55f, 0.55f);
            a.wanderTime = random(0.2f, 0.6f);
        }
        Vec2 acceleration{std::cos(a.heading) * 75.0f, std::sin(a.heading) * 75.0f};

        Vec2 center{}, alignment{}, separation{};
        int neighbors = 0;
        for (std::size_t j = 0; j < oldPositions.size(); ++j) {
            if (j == i) continue;
            const Vec2 delta = oldPositions[j] - oldPositions[i];
            const float dist = length(delta);
            if (dist < 55.0f) {
                center = center + oldPositions[j];
                alignment = alignment + oldVelocities[j];
                ++neighbors;
                if (dist < 14.0f && dist > 0.001f) separation = separation - delta * (1.0f / dist);
            }
        }
        if (neighbors > 0) {
            acceleration = acceleration + unit(center * (1.0f / neighbors) - a.position) * 35.0f;
            acceleration = acceleration + unit(alignment) * 28.0f;
            acceleration = acceleration + unit(separation) * 125.0f;
        }

        if (a.cursorInterested && a.cooldown == 0 && cursorDistance < 140.0f) {
            acceleration = acceleration + unit(toCursor) * (210.0f * (1.0f - cursorDistance / 140.0f));
        } else if (a.state == State::fleeing && cursorDistance < 100.0f) {
            acceleration = acceleration - unit(toCursor) * 180.0f;
        }

        // Read-only app-window rectangles guide ants along visible edges.
        float nearest = 30.0f;
        Vec2 edgePoint{}, tangent{};
        for (const Rect& r : windows) {
            if (r.right - r.left < 50 || r.bottom - r.top < 50) continue;
            const float x = std::clamp(a.position.x, r.left, r.right);
            const float y = std::clamp(a.position.y, r.top, r.bottom);
            const float left = std::abs(a.position.x - r.left);
            const float right = std::abs(a.position.x - r.right);
            const float top = std::abs(a.position.y - r.top);
            const float bottom = std::abs(a.position.y - r.bottom);
            const float side = std::min({left, right, top, bottom});
            Vec2 p{}, t{};
            if (side == left) { p = {r.left, y}; t = {0, 1}; }
            else if (side == right) { p = {r.right, y}; t = {0, 1}; }
            else if (side == top) { p = {x, r.top}; t = {1, 0}; }
            else { p = {x, r.bottom}; t = {1, 0}; }
            const float d = length(p - a.position);
            if (d < nearest) { nearest = d; edgePoint = p; tangent = t; }
        }
        if (nearest < 30.0f) {
            a.edgeContact = nearest < 10.0f;
            acceleration = acceleration + unit(edgePoint - a.position) * (65.0f * (1.0f - nearest / 30.0f));
            acceleration = acceleration + tangent * (a.clockwise ? 55.0f : -55.0f);
        }

        a.velocity = limit((a.velocity + acceleration * dt) * std::exp(-1.8f * dt),
                           a.state == State::fleeing ? 120.0f : 72.0f);
        a.position = a.position + a.velocity * dt;
        if (a.position.x < 0 || a.position.x > width_) a.velocity.x = -a.velocity.x;
        if (a.position.y < 0 || a.position.y > height_) a.velocity.y = -a.velocity.y;
        a.position.x = std::clamp(a.position.x, 0.0f, width_);
        a.position.y = std::clamp(a.position.y, 0.0f, height_);
        if (length(a.velocity) > 2.0f) a.heading = std::atan2(a.velocity.y, a.velocity.x);
    }
}
} // namespace ants
