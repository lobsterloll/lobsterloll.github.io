#include "simulation.h"

#include <cmath>
#include <iostream>
#include <stdexcept>
#include <vector>

void require(bool condition, const char* description) {
    if (!condition) throw std::runtime_error(description);
}

#define CHECK(expression) require((expression), #expression)

int main() {
    ants::Simulation a(800, 600, 250, 12345);
    ants::Simulation b(800, 600, 250, 12345);
    CHECK(a.ants().size() == 250);
    CHECK(b.ants().size() == 250);
    for (std::size_t i = 0; i < 250; ++i) {
        CHECK(a.ants()[i].position.x == b.ants()[i].position.x);
        CHECK(a.ants()[i].position.y == b.ants()[i].position.y);
    }

    const auto contact = a.ants()[0].position;
    CHECK(a.ants()[0].cursorInterested);
    a.step(0.02f, contact, {});
    CHECK(a.ants()[0].state == ants::State::biting);
    for (int i = 0; i < 15; ++i) a.step(0.02f, contact, {});
    CHECK(a.ants()[0].state == ants::State::attached);
    const auto offset = a.ants()[0].attachOffset;
    const ants::Vec2 moved{contact.x + 5, contact.y + 2};
    a.step(0.02f, moved, {});
    CHECK(a.ants()[0].state == ants::State::attached);
    CHECK(std::abs(a.ants()[0].position.x - moved.x - offset.x) < 0.01f);
    CHECK(std::abs(a.ants()[0].position.y - moved.y - offset.y) < 0.01f);
    a.step(0.02f, {moved.x + 100, moved.y}, {});
    CHECK(a.ants()[0].state == ants::State::fleeing);
    CHECK(a.ants()[0].cooldown > 0);

    ants::Simulation timeout(800, 600, 250, 12345);
    const auto timeoutContact = timeout.ants()[0].position;
    for (int i = 0; i < 16; ++i) timeout.step(0.02f, timeoutContact, {});
    CHECK(timeout.ants()[0].state == ants::State::attached);
    for (int i = 0; i < 151; ++i) timeout.step(0.02f, timeoutContact, {});
    CHECK(timeout.ants()[0].state == ants::State::fleeing);

    ants::Simulation edge(800, 600, 250, 456);
    const auto edgePosition = edge.ants()[0].position;
    const ants::Rect nearbyWindow{edgePosition.x, edgePosition.y - 100,
                                  edgePosition.x + 200, edgePosition.y + 100};
    edge.step(0.016f, {-1000, -1000}, {nearbyWindow});
    CHECK(edge.ants()[0].edgeContact);

    const std::vector<ants::Rect> windows{{100, 100, 400, 300}};
    for (int frame = 0; frame < 3000; ++frame) {
        a.step(0.016f, {-1000, -1000}, windows);
        for (const auto& ant : a.ants()) {
            CHECK(std::isfinite(ant.position.x) && std::isfinite(ant.position.y));
            CHECK(ant.position.x >= 0 && ant.position.x <= a.width());
            CHECK(ant.position.y >= 0 && ant.position.y <= a.height());
        }
    }
    a.resize(320, 240);
    for (const auto& ant : a.ants()) {
        CHECK(ant.position.x >= 0 && ant.position.x <= 320);
        CHECK(ant.position.y >= 0 && ant.position.y <= 240);
    }
    std::cout << "Simulation tests passed: count, deterministic seed, bite, attach, drag, detach, bounds, resize.\n";
}
