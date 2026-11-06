cmake_minimum_required(VERSION 3.20)
cmake_policy(SET CMP0091 NEW)
project(DesktopAntInvasion LANGUAGES CXX)
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_library(ant_simulation src/simulation.cpp)
target_include_directories(ant_simulation PUBLIC src)

add_executable(DesktopAntInvasion WIN32 src/main.cpp)
target_link_libraries(DesktopAntInvasion PRIVATE ant_simulation d2d1 windowscodecs ole32 shell32 user32 gdi32)
target_compile_definitions(DesktopAntInvasion PRIVATE UNICODE _UNICODE NOMINMAX WIN32_LEAN_AND_MEAN)

enable_testing()
add_executable(ant_tests tests/simulation_tests.cpp)
target_link_libraries(ant_tests PRIVATE ant_simulation)
add_test(NAME simulation COMMAND ant_tests)

if(MSVC)
  target_compile_options(ant_simulation PRIVATE /W4 /permissive-)
  target_compile_options(DesktopAntInvasion PRIVATE /W4 /permissive-)
  target_compile_options(ant_tests PRIVATE /W4 /permissive-)
endif()
