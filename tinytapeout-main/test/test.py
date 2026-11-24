# SPDX-FileCopyrightText: © 2024 Tiny Tapeout
# SPDX-License-Identifier: Apache-2.0

import cocotb
from cocotb.clock import Clock
from cocotb.triggers import ClockCycles


@cocotb.test()
async def test_project(dut):
    dut._log.info("Start")

    # Set the clock period to 10 us (100 KHz)
    clock = Clock(dut.clk, 10, unit="us")
    cocotb.start_soon(clock.start())

    # Reset
    dut._log.info("Reset")
    dut.ena.value = 1
    dut.ui_in.value = 0
    dut.uio_in.value = 0
    dut.rst_n.value = 0
    await ClockCycles(dut.clk, 10)
    dut.rst_n.value = 1

    dut._log.info("Test project behavior")

    # Set the input values you want to test
    dut.ui_in.value = 0
    await ClockCycles(dut.clk, 1)
    assert dut.uo_out.value == 0b0111111

    dut.ui_in.value = 1
    await ClockCycles(dut.clk, 1)
    assert dut.uo_out.value == 0b0000110

    dut.ui_in.value = 2
    await ClockCycles(dut.clk, 1)
    assert dut.uo_out.value == 0b1011011

    dut.ui_in.value = 3
    await ClockCycles(dut.clk, 1)
    assert dut.uo_out.value == 0b1001111
    
    dut.ui_in.value = 4
    await ClockCycles(dut.clk, 1)
    assert dut.uo_out.value == 0b1100110

    dut.ui_in.value = 5
    await ClockCycles(dut.clk, 1)
    assert dut.uo_out.value == 0b1101101

    dut.ui_in.value = 6
    await ClockCycles(dut.clk, 1)
    assert dut.uo_out.value == 0b1111101

    dut.ui_in.value = 7
    await ClockCycles(dut.clk, 1)
    assert dut.uo_out.value == 0b0000111
    
    dut.ui_in.value = 8
    await ClockCycles(dut.clk, 1)
    assert dut.uo_out.value == 0b1111111

    dut.ui_in.value = 9
    await ClockCycles(dut.clk, 1)
    assert dut.uo_out.value == 0b1101111

    dut.ui_in.value = 10
    await ClockCycles(dut.clk, 1)
    assert dut.uo_out.value == 0b0000000

    
   

    # Wait for one clock cycle to see the output values


    # The following assersion is just an example of how to check the output values.
    # Change it to match the actual expected output of your module:
 

    # Keep testing the module by changing the input values, waiting for
    # one or more clock cycles, and asserting the expected output values.
