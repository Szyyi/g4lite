# app/seed.py
"""
G4Lite — Idempotent seed script.

Populates the database with initial users, category hierarchy, and a
comprehensive technical equipment inventory.  Safe to run multiple times —
checks for existing data before inserting.

Usage (standalone):
    docker compose exec backend python -m app.seed

Usage (from application lifespan — when SEED_ON_STARTUP=True):
    Called automatically by ``app.main`` during startup.

Design principles:
    - Every item starts CLEAN: serviceable_count == total_quantity,
      zero damaged / unserviceable / condemned / checked_out.
    - All users have ``must_change_password=True`` — forces credential
      rotation on first login.
    - No real names, unit names, or location identifiers.
    - Item codes follow the pattern ``G4L-{CAT_CODE}-{SEQ:03d}``.
    - Storage locations follow ``Room {R} / Shelf {S} / Bin {B}``.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_standalone_session, init_db
from app.models.category import Category
from app.models.item import Item
from app.models.user import User, UserRole
from app.utils.security import hash_password

logger = logging.getLogger(__name__)

settings = get_settings()


# ══════════════════════════════════════════════════════════════════════════
# USER DEFINITIONS
# ══════════════════════════════════════════════════════════════════════════

_USERS = [
    {
        "username": "admin",
        "email": "admin@G4Lite.local",
        "full_name": "Admin User",
        "rank": "N/A",
        "role": UserRole.admin,
        "password": "admin123",
        "service_number": "00000000",
    },
    {
        "username": "admin2",
        "email": "admin2@G4Lite.local",
        "full_name": "Admin Two",
        "rank": "N/A",
        "role": UserRole.admin,
        "password": "admin123",
        "service_number": "00000001",
    },
    {
        "username": "user1",
        "email": "user1@G4Lite.local",
        "full_name": "Store User One",
        "rank": "N/A",
        "role": UserRole.user,
        "password": "user1234",
        "service_number": "00000002",
    },
    {
        "username": "user2",
        "email": "user2@G4Lite.local",
        "full_name": "Store User Two",
        "rank": "N/A",
        "role": UserRole.user,
        "password": "user1234",
        "service_number": "00000003",
    },
    {
        "username": "user3",
        "email": "user3@G4Lite.local",
        "full_name": "Store User Three",
        "rank": "N/A",
        "role": UserRole.user,
        "password": "user1234",
        "service_number": "00000004",
    },
    {
        "username": "user4",
        "email": "user4@G4Lite.local",
        "full_name": "Store User Four",
        "rank": "N/A",
        "role": UserRole.user,
        "password": "user1234",
        "service_number": "00000005",
    },
    {
        "username": "user5",
        "email": "user5@G4Lite.local",
        "full_name": "Store User Five",
        "rank": "N/A",
        "role": UserRole.user,
        "password": "user1234",
        "service_number": "00000006",
    },
]


# ══════════════════════════════════════════════════════════════════════════
# CATEGORY HIERARCHY
# ══════════════════════════════════════════════════════════════════════════
#
# 4 top-level categories, each with 3–4 subcategories.
# ``code`` is used in item_code generation.  ``icon`` is a MUI icon name
# rendered in the frontend sidebar/chip.  ``colour`` is a hex string for
# category badges.

_TOP_CATEGORIES = [
    {
        "name": "Computing",
        "code": "COMP",
        "description": "Single-board computers, mini PCs, workstations, peripherals, storage media, and computing accessories",
        "icon": "Computer",
        "colour": "#3B82F6",
        "sort_order": 1,
        "children": [
            {"name": "Single Board Computers", "code": "SBC",  "description": "ARM and RISC-V based single-board computers and development boards",   "icon": "DeveloperBoard", "sort_order": 1},
            {"name": "Mini PCs & Workstations","code": "MPC",  "description": "Compact x86/x64 desktops, NUCs, thin clients, and portable workstations","icon": "DesktopWindows","sort_order": 2},
            {"name": "Peripherals & Displays", "code": "PER",  "description": "Monitors, keyboards, mice, USB hubs, docking stations, and input devices","icon": "Keyboard",      "sort_order": 3},
            {"name": "Storage Media",          "code": "STM",  "description": "MicroSD cards, USB flash drives, SSDs, HDDs, and NVMe modules",         "icon": "SdCard",        "sort_order": 4},
        ],
    },
    {
        "name": "Communications",
        "code": "COMM",
        "description": "Radios, antennas, signal cables, connectors, network switches, and routing infrastructure",
        "icon": "SettingsInputAntenna",
        "colour": "#10B981",
        "sort_order": 2,
        "children": [
            {"name": "Radio Systems",          "code": "RAD",  "description": "VHF/UHF handheld and manpack transceivers, programmers, and spares",     "icon": "Radio",         "sort_order": 1},
            {"name": "Antennas & RF",          "code": "ANT",  "description": "Directional and omnidirectional antennas, RF adapters, and coax fittings","icon": "CellTower",    "sort_order": 2},
            {"name": "Cables & Connectors",    "code": "CAB",  "description": "Coaxial, Ethernet, fibre optic, serial, and USB cabling",                "icon": "Cable",         "sort_order": 3},
            {"name": "Network Infrastructure", "code": "NET",  "description": "Managed switches, routers, access points, and fibre patch panels",       "icon": "Hub",           "sort_order": 4},
        ],
    },
    {
        "name": "Power & Energy",
        "code": "POWR",
        "description": "Portable power, mains supplies, solar generation, batteries, UPS systems, and charging solutions",
        "icon": "BatteryChargingFull",
        "colour": "#F59E0B",
        "sort_order": 3,
        "children": [
            {"name": "Portable Power",        "code": "PPW",  "description": "Power banks, field-swappable batteries, and portable charging stations",  "icon": "Battery4Bar",     "sort_order": 1},
            {"name": "Mains & Fixed Power",   "code": "MPW",  "description": "AC/DC adapters, bench PSUs, UPS units, PDUs, and surge protectors",       "icon": "Power",           "sort_order": 2},
            {"name": "Solar & Renewable",     "code": "SOL",  "description": "Foldable solar panels, charge controllers, and field energy kits",        "icon": "WbSunny",         "sort_order": 3},
        ],
    },
    {
        "name": "Test, Tools & Accessories",
        "code": "ACCS",
        "description": "Test and measurement instruments, protective cases, adapters, hand tools, and consumables",
        "icon": "Construction",
        "colour": "#8B5CF6",
        "sort_order": 4,
        "children": [
            {"name": "Test & Measurement",       "code": "TST",  "description": "Multimeters, oscilloscopes, cable testers, spectrum analysers, and logic analysers","icon": "Speed",       "sort_order": 1},
            {"name": "Protective Cases & Storage","code": "CAS",  "description": "Pelican cases, transit cases, foam inserts, and equipment bags",                   "icon": "Inventory2",  "sort_order": 2},
            {"name": "Adapters & Converters",     "code": "ADP",  "description": "Video, audio, power, and data format converters and gender changers",               "icon": "SettingsInputHdmi","sort_order": 3},
            {"name": "Tools & Consumables",       "code": "TOL",  "description": "Hand tools, soldering equipment, cable ties, labels, and cleaning supplies",        "icon": "Handyman",    "sort_order": 4},
        ],
    },
]


# ══════════════════════════════════════════════════════════════════════════
# ITEM CATALOGUE
#
# Every item starts with ALL stock serviceable and available.
# No fake damage, no artificial sign-outs — this is plug-and-play.
#
# Fields:
#   cat         – subcategory code (matched to _TOP_CATEGORIES children)
#   name        – display name
#   short       – one-line summary for list views
#   desc        – full description
#   mfr         – manufacturer
#   model       – model number / part number
#   qty         – total quantity (= serviceable = available on seed)
#   min_stock   – minimum stock level before low-stock alert
#   crit        – criticality: routine | important | critical | essential
#   consumable  – True if item is consumed on use (cable ties, labels, etc.)
#   approval    – True if sign-out requires admin approval
#   loc/shelf/bin – storage location
#   tags        – searchable tag list
#   weight      – per-unit weight in kg (optional)
# ══════════════════════════════════════════════════════════════════════════

_ITEMS = [
    # ── COMPUTING > SINGLE BOARD COMPUTERS ─────────────────────────────
    {"cat": "SBC", "name": "Raspberry Pi 4 Model B (4GB)",    "short": "RPi4 4GB SBC",        "desc": "Quad-core Cortex-A72, 4GB LPDDR4, dual micro-HDMI, USB-C power, Gigabit Ethernet, dual-band Wi-Fi",     "mfr": "Raspberry Pi Foundation", "model": "RPI4-MODBP-4GB",   "qty": 20, "min_stock": 5,  "crit": "critical",  "loc": "Room 1", "shelf": "A1", "bin": "01", "tags": ["sbc","arm","linux","gpio","headless"], "weight": 0.046},
    {"cat": "SBC", "name": "Raspberry Pi 4 Model B (8GB)",    "short": "RPi4 8GB SBC",        "desc": "Quad-core Cortex-A72, 8GB LPDDR4, dual micro-HDMI, USB-C power, Gigabit Ethernet, dual-band Wi-Fi",     "mfr": "Raspberry Pi Foundation", "model": "RPI4-MODBP-8GB",   "qty": 12, "min_stock": 3,  "crit": "critical",  "loc": "Room 1", "shelf": "A1", "bin": "02", "tags": ["sbc","arm","linux","gpio","headless"], "weight": 0.046},
    {"cat": "SBC", "name": "Raspberry Pi 5 (8GB)",            "short": "RPi5 8GB SBC",        "desc": "Quad-core Cortex-A76, 8GB LPDDR4X, PCIe 2.0, dual 4Kp60 HDMI, USB-C PD power",                         "mfr": "Raspberry Pi Foundation", "model": "RPI5-8GB",         "qty": 8,  "min_stock": 2,  "crit": "critical",  "loc": "Room 1", "shelf": "A1", "bin": "03", "tags": ["sbc","arm","linux","pcie","gpio"], "weight": 0.047},
    {"cat": "SBC", "name": "Raspberry Pi Zero 2 W",           "short": "RPi Zero 2 W",        "desc": "Quad-core Cortex-A53, 512MB RAM, Wi-Fi, Bluetooth 4.2, mini-HDMI, micro-USB OTG",                       "mfr": "Raspberry Pi Foundation", "model": "RPI-ZERO2W",       "qty": 15, "min_stock": 5,  "crit": "important", "loc": "Room 1", "shelf": "A1", "bin": "04", "tags": ["sbc","arm","compact","iot","headless"], "weight": 0.010},
    {"cat": "SBC", "name": "NVIDIA Jetson Nano Developer Kit", "short": "Jetson Nano 4GB",    "desc": "128-core Maxwell GPU, quad-core A57, 4GB LPDDR4, MIPI CSI-2 camera ports, GPIO header",                "mfr": "NVIDIA",                  "model": "945-13450-0000-100","qty": 4,  "min_stock": 1,  "crit": "critical",  "loc": "Room 1", "shelf": "A1", "bin": "05", "tags": ["sbc","gpu","ml","ai","cuda","vision"], "weight": 0.138, "approval": True},
    {"cat": "SBC", "name": "Arduino Mega 2560 Rev3",          "short": "Arduino Mega 2560",   "desc": "ATmega2560 microcontroller, 54 digital I/O, 16 analog inputs, 256KB flash, USB-B",                      "mfr": "Arduino",                 "model": "A000067",          "qty": 10, "min_stock": 3,  "crit": "routine",   "loc": "Room 1", "shelf": "A2", "bin": "01", "tags": ["microcontroller","avr","prototyping","gpio","serial"], "weight": 0.037},
    {"cat": "SBC", "name": "ESP32 DevKit V1 (30-pin)",        "short": "ESP32 Dev Board",     "desc": "Dual-core Xtensa LX6, Wi-Fi 802.11 b/g/n, Bluetooth 4.2/BLE, 38 GPIO pins, micro-USB",                 "mfr": "Espressif",               "model": "ESP32-DEVKITC-32D","qty": 20, "min_stock": 5,  "crit": "important", "loc": "Room 1", "shelf": "A2", "bin": "02", "tags": ["microcontroller","wifi","bluetooth","iot","sensor"], "weight": 0.009},

    # ── COMPUTING > MINI PCS & WORKSTATIONS ────────────────────────────
    {"cat": "MPC", "name": "Intel NUC 12 Pro (i5-1240P)",     "short": "NUC12 i5 Mini PC",    "desc": "Intel i5-1240P, 16GB DDR4, 256GB NVMe SSD, Thunderbolt 4, dual HDMI 2.0b, Wi-Fi 6E",                   "mfr": "Intel",                   "model": "RNUC12WSHi50002",  "qty": 6,  "min_stock": 2,  "crit": "critical",  "loc": "Room 1", "shelf": "B1", "bin": "01", "tags": ["x86","mini-pc","thunderbolt","ssd","wifi6e"], "weight": 0.620, "approval": True},
    {"cat": "MPC", "name": "Beelink SER5 Mini PC (Ryzen 5)",  "short": "SER5 Ryzen Mini PC",  "desc": "AMD Ryzen 5 5560U, 16GB DDR4, 500GB NVMe, dual HDMI, USB-C, Wi-Fi 6",                                  "mfr": "Beelink",                 "model": "SER5-5560U",       "qty": 4,  "min_stock": 1,  "crit": "important", "loc": "Room 1", "shelf": "B1", "bin": "02", "tags": ["x86","mini-pc","amd","ssd","compact"], "weight": 0.455},
    {"cat": "MPC", "name": "Lenovo ThinkCentre M75q Gen 2",   "short": "ThinkCentre Tiny PC", "desc": "AMD Ryzen 5 Pro 5650GE, 16GB DDR4, 256GB NVMe, DisplayPort + HDMI, USB-C, vPro management",             "mfr": "Lenovo",                  "model": "11JN0047UK",       "qty": 3,  "min_stock": 1,  "crit": "important", "loc": "Room 1", "shelf": "B1", "bin": "03", "tags": ["x86","mini-pc","enterprise","vpro","managed"], "weight": 1.250, "approval": True},
    {"cat": "MPC", "name": "Raspberry Pi Compute Module 4 (8GB/32GB)", "short": "CM4 8GB/32GB", "desc": "BCM2711, 8GB LPDDR4, 32GB eMMC, optional Wi-Fi, for industrial carrier boards",                        "mfr": "Raspberry Pi Foundation", "model": "CM4108032",        "qty": 6,  "min_stock": 2,  "crit": "important", "loc": "Room 1", "shelf": "B2", "bin": "01", "tags": ["compute-module","arm","industrial","embedded","carrier-board"], "weight": 0.012},

    # ── COMPUTING > PERIPHERALS & DISPLAYS ─────────────────────────────
    {"cat": "PER", "name": "Portable Monitor 15.6\" IPS 1080p", "short": "15.6\" USB-C Monitor","desc": "15.6-inch IPS panel, 1920×1080, USB-C PD + mini-HDMI input, built-in speakers, foldable stand",        "mfr": "ASUS",                    "model": "MB16ACV",          "qty": 6,  "min_stock": 2,  "crit": "important", "loc": "Room 1", "shelf": "C1", "bin": "01", "tags": ["monitor","portable","usb-c","ips","1080p"], "weight": 0.710},
    {"cat": "PER", "name": "USB 3.0 Hub (7-Port, Powered)",   "short": "7-Port USB 3.0 Hub",  "desc": "Powered USB 3.0 hub, 7 data ports, individual switches, 36W external PSU, aluminium body",              "mfr": "Anker",                   "model": "A7505",            "qty": 15, "min_stock": 4,  "crit": "routine",   "loc": "Room 1", "shelf": "C1", "bin": "02", "tags": ["usb","hub","powered","data-transfer"], "weight": 0.270},
    {"cat": "PER", "name": "USB-C Docking Station (12-in-1)", "short": "12-in-1 USB-C Dock",  "desc": "HDMI 4K60 + DP 4K60, 2× USB-A 3.0, USB-C PD 100W passthrough, SD/microSD, RJ45 Gigabit, 3.5mm audio",  "mfr": "CalDigit",                "model": "TS4",              "qty": 8,  "min_stock": 2,  "crit": "important", "loc": "Room 1", "shelf": "C1", "bin": "03", "tags": ["dock","usb-c","thunderbolt","hdmi","ethernet"], "weight": 0.340},
    {"cat": "PER", "name": "Wireless Keyboard & Mouse Combo", "short": "KB+Mouse Wireless Set","desc": "Full-size keyboard + ambidextrous mouse, 2.4GHz USB-A nano receiver, AA batteries included",            "mfr": "Logitech",                "model": "MK270",            "qty": 12, "min_stock": 4,  "crit": "routine",   "loc": "Room 1", "shelf": "C2", "bin": "01", "tags": ["keyboard","mouse","wireless","input","2.4ghz"], "weight": 0.590},
    {"cat": "PER", "name": "USB to TTL Serial Adapter (FTDI)","short": "USB-TTL FTDI Adapter", "desc": "FTDI FT232RL USB to UART TTL 3.3V/5V, 6-pin header, LED TX/RX indicators",                              "mfr": "FTDI",                    "model": "TTL-232R-3V3",     "qty": 10, "min_stock": 3,  "crit": "routine",   "loc": "Room 1", "shelf": "C2", "bin": "02", "tags": ["serial","uart","ftdi","debug","console"], "weight": 0.025},
    {"cat": "PER", "name": "USB Webcam 1080p Autofocus",      "short": "1080p USB Webcam",    "desc": "Full HD 1080p at 30fps, autofocus, built-in dual microphone, USB-A, universal clip mount",               "mfr": "Logitech",                "model": "C920",             "qty": 6,  "min_stock": 2,  "crit": "routine",   "loc": "Room 1", "shelf": "C2", "bin": "03", "tags": ["camera","webcam","1080p","usb","video"], "weight": 0.162},

    # ── COMPUTING > STORAGE MEDIA ──────────────────────────────────────
    {"cat": "STM", "name": "MicroSD Card 64GB (A2, V30)",     "short": "64GB microSD A2",     "desc": "UHS-I U3 A2 V30, 170MB/s read, 90MB/s write, with SD adapter",                                          "mfr": "SanDisk",                 "model": "SDSQXAH-064G",    "qty": 40, "min_stock": 10, "crit": "important", "loc": "Room 1", "shelf": "D1", "bin": "01", "tags": ["microsd","storage","64gb","a2","boot-media"], "weight": 0.001, "consumable": True},
    {"cat": "STM", "name": "MicroSD Card 128GB (A2, V30)",    "short": "128GB microSD A2",    "desc": "UHS-I U3 A2 V30, 170MB/s read, 90MB/s write, with SD adapter",                                          "mfr": "SanDisk",                 "model": "SDSQXAH-128G",    "qty": 20, "min_stock": 5,  "crit": "important", "loc": "Room 1", "shelf": "D1", "bin": "02", "tags": ["microsd","storage","128gb","a2","boot-media"], "weight": 0.001, "consumable": True},
    {"cat": "STM", "name": "USB Flash Drive 64GB (USB 3.2)",  "short": "64GB USB 3.2 Stick",  "desc": "USB 3.2 Gen 1, 150MB/s read, retractable connector, lanyard loop",                                      "mfr": "Samsung",                 "model": "MUF-64BE4",       "qty": 20, "min_stock": 5,  "crit": "routine",   "loc": "Room 1", "shelf": "D1", "bin": "03", "tags": ["usb","flash","64gb","portable","backup"], "weight": 0.008},
    {"cat": "STM", "name": "NVMe SSD 500GB (M.2 2280)",       "short": "500GB NVMe M.2 SSD",  "desc": "PCIe Gen 3×4 NVMe, M.2 2280, 3500MB/s read, 2300MB/s write, TLC NAND",                                  "mfr": "Samsung",                 "model": "MZ-V8V500BW",     "qty": 8,  "min_stock": 2,  "crit": "important", "loc": "Room 1", "shelf": "D1", "bin": "04", "tags": ["ssd","nvme","m2","500gb","storage"], "weight": 0.008},
    {"cat": "STM", "name": "Portable SSD 1TB (USB-C)",        "short": "1TB Portable SSD",    "desc": "USB 3.2 Gen 2 (10Gbps), 1050MB/s read, IP65 dust/water resistant, USB-C to USB-C and USB-A cables",     "mfr": "Samsung",                 "model": "MU-PA1T0B",       "qty": 4,  "min_stock": 1,  "crit": "important", "loc": "Room 1", "shelf": "D2", "bin": "01", "tags": ["ssd","portable","1tb","usb-c","ruggedised"], "weight": 0.058, "approval": True},

    # ── COMMUNICATIONS > RADIO SYSTEMS ─────────────────────────────────
    {"cat": "RAD", "name": "VHF Handheld Transceiver (5W)",   "short": "VHF 5W Handheld",     "desc": "136–174 MHz, 5W output, 128 channels, CTCSS/DCS, IP54, Li-Ion 2600mAh battery, belt clip",              "mfr": "Baofeng",                 "model": "UV-5R III",        "qty": 12, "min_stock": 4,  "crit": "critical",  "loc": "Room 2", "shelf": "A1", "bin": "01", "tags": ["radio","vhf","handheld","transceiver","field"], "weight": 0.250, "approval": True},
    {"cat": "RAD", "name": "UHF Handheld Transceiver (4W)",   "short": "UHF 4W Handheld",     "desc": "400–470 MHz, 4W output, 16 channels, VOX, emergency alarm, USB programming cable included",             "mfr": "Baofeng",                 "model": "BF-888S",         "qty": 12, "min_stock": 4,  "crit": "critical",  "loc": "Room 2", "shelf": "A1", "bin": "02", "tags": ["radio","uhf","handheld","transceiver","field"], "weight": 0.210},
    {"cat": "RAD", "name": "Software Defined Radio (RTL-SDR)","short": "RTL-SDR V4 Receiver", "desc": "RTL2832U + R828D, 500kHz–1.7GHz, 8-bit ADC, SMA female, USB 2.0, aluminium enclosure",                  "mfr": "RTL-SDR Blog",            "model": "RTL-SDR V4",       "qty": 6,  "min_stock": 2,  "crit": "important", "loc": "Room 2", "shelf": "A1", "bin": "03", "tags": ["sdr","receiver","spectrum","wideband","usb"], "weight": 0.045},
    {"cat": "RAD", "name": "Radio Programming Cable (USB)",   "short": "USB Radio Prog Cable","desc": "USB to Kenwood 2-pin programming cable, FTDI chipset, compatible with Baofeng/Kenwood handhelds",        "mfr": "Generic",                 "model": "USB-K1",           "qty": 6,  "min_stock": 2,  "crit": "routine",   "loc": "Room 2", "shelf": "A2", "bin": "01", "tags": ["radio","programming","usb","cable","baofeng"], "weight": 0.035},

    # ── COMMUNICATIONS > ANTENNAS & RF ─────────────────────────────────
    {"cat": "ANT", "name": "UHF Yagi Antenna (10dBi)",        "short": "UHF 10dBi Yagi",      "desc": "Directional 5-element Yagi, 400–470MHz, 10dBi gain, N-female connector, boom-mount bracket",            "mfr": "Diamond",                 "model": "A430S10",          "qty": 6,  "min_stock": 2,  "crit": "important", "loc": "Room 2", "shelf": "B1", "bin": "01", "tags": ["antenna","uhf","yagi","directional","high-gain"], "weight": 0.850},
    {"cat": "ANT", "name": "VHF/UHF Dual-Band Whip Antenna",  "short": "Dual-Band Whip",     "desc": "Flexible rubber duck antenna, SMA-male, 144/430MHz, 2.15dBi, for handheld radios",                      "mfr": "Nagoya",                  "model": "NA-771",           "qty": 15, "min_stock": 5,  "crit": "routine",   "loc": "Room 2", "shelf": "B1", "bin": "02", "tags": ["antenna","dual-band","whip","sma","portable"], "weight": 0.030},
    {"cat": "ANT", "name": "Wi-Fi Panel Antenna 2.4GHz (14dBi)","short": "2.4GHz 14dBi Panel","desc": "Directional flat panel, 2.4GHz, 14dBi, RP-SMA male, wall/pole mount, 30° beamwidth",                    "mfr": "L-com",                   "model": "HG2414P",          "qty": 4,  "min_stock": 1,  "crit": "important", "loc": "Room 2", "shelf": "B1", "bin": "03", "tags": ["antenna","wifi","2.4ghz","directional","panel"], "weight": 0.320},
    {"cat": "ANT", "name": "SMA Adapter Kit (6-piece)",        "short": "SMA Adapter Set",    "desc": "SMA to BNC, SMA to N-type, RP-SMA to SMA, male-to-male, female-to-female, gold-plated",                 "mfr": "Pasternack",              "model": "PE9600",           "qty": 10, "min_stock": 3,  "crit": "routine",   "loc": "Room 2", "shelf": "B2", "bin": "01", "tags": ["adapter","sma","bnc","n-type","rf"], "weight": 0.040},

    # ── COMMUNICATIONS > CABLES & CONNECTORS ───────────────────────────
    {"cat": "CAB", "name": "RG-58 Coaxial Cable (50m Spool)", "short": "RG-58 50m Coax",      "desc": "50-ohm coaxial, BNC male connectors pre-terminated both ends, 50 metre spool",                          "mfr": "Belden",                  "model": "8259-050",         "qty": 8,  "min_stock": 2,  "crit": "important", "loc": "Room 2", "shelf": "C1", "bin": "01", "tags": ["coax","rg58","50ohm","bnc","rf-cable"], "weight": 2.400},
    {"cat": "CAB", "name": "Cat6a Shielded Patch Cable (3m)", "short": "Cat6a STP 3m",        "desc": "S/FTP Cat6a, 3 metre, RJ45 both ends, snagless boots, 10GbE rated",                                     "mfr": "StarTech",                "model": "6ASPAT3M",         "qty": 50, "min_stock": 15, "crit": "routine",   "loc": "Room 2", "shelf": "C1", "bin": "02", "tags": ["ethernet","cat6a","patch","shielded","3m"], "weight": 0.095, "consumable": True},
    {"cat": "CAB", "name": "Cat6a Shielded Patch Cable (10m)","short": "Cat6a STP 10m",       "desc": "S/FTP Cat6a, 10 metre, RJ45 both ends, snagless boots, 10GbE rated",                                    "mfr": "StarTech",                "model": "6ASPAT10M",        "qty": 20, "min_stock": 5,  "crit": "routine",   "loc": "Room 2", "shelf": "C1", "bin": "03", "tags": ["ethernet","cat6a","patch","shielded","10m"], "weight": 0.310, "consumable": True},
    {"cat": "CAB", "name": "LC-LC Duplex Fibre Patch (5m, OM3)","short": "LC-LC OM3 Fibre 5m","desc": "Multi-mode OM3, LC-LC duplex, 50/125μm, aqua jacket, 5 metre",                                          "mfr": "Corning",                 "model": "LC-LC-OM3-5M",    "qty": 10, "min_stock": 3,  "crit": "important", "loc": "Room 2", "shelf": "C2", "bin": "01", "tags": ["fibre","lc","om3","multimode","patch"], "weight": 0.045},
    {"cat": "CAB", "name": "USB-C to USB-C Cable (2m, 100W)", "short": "USB-C 100W 2m Cable", "desc": "USB 3.2 Gen 2, 10Gbps data + 100W PD charging, 2 metre, braided nylon",                                 "mfr": "Anker",                   "model": "A8486",            "qty": 20, "min_stock": 5,  "crit": "routine",   "loc": "Room 2", "shelf": "C2", "bin": "02", "tags": ["usb-c","cable","100w","pd","data"], "weight": 0.055, "consumable": True},
    {"cat": "CAB", "name": "Micro-HDMI to HDMI Cable (1.5m)", "short": "Micro-HDMI 1.5m",    "desc": "Micro-HDMI (Type D) to full-size HDMI (Type A), 4K60, 1.5 metre, for RPi 4/5",                          "mfr": "Amazon Basics",           "model": "HL-007347",        "qty": 15, "min_stock": 5,  "crit": "routine",   "loc": "Room 2", "shelf": "C2", "bin": "03", "tags": ["hdmi","micro-hdmi","video","rpi","display"], "weight": 0.040},

    # ── COMMUNICATIONS > NETWORK INFRASTRUCTURE ────────────────────────
    {"cat": "NET", "name": "Managed Gigabit Switch (24-Port)", "short": "24-Port GbE Switch",  "desc": "Layer 2+ managed, 24× 10/100/1000, 4× SFP uplink, VLAN, QoS, SNMP, rack-mount 1U",                    "mfr": "Netgear",                 "model": "GS724TPv3",        "qty": 3,  "min_stock": 1,  "crit": "critical",  "loc": "Room 2", "shelf": "D1", "bin": "01", "tags": ["switch","gigabit","managed","vlan","rack"], "weight": 2.900, "approval": True},
    {"cat": "NET", "name": "Unmanaged Gigabit Switch (8-Port)","short": "8-Port GbE Switch",   "desc": "Plug-and-play 8× 10/100/1000, metal case, fanless, desktop/wall-mount",                                 "mfr": "TP-Link",                 "model": "TL-SG108",         "qty": 8,  "min_stock": 3,  "crit": "important", "loc": "Room 2", "shelf": "D1", "bin": "02", "tags": ["switch","gigabit","unmanaged","compact","fanless"], "weight": 0.500},
    {"cat": "NET", "name": "Wi-Fi 6 Access Point (Ceiling)",  "short": "Wi-Fi 6 AP Indoor",   "desc": "802.11ax dual-band, 1.8Gbps aggregate, PoE powered, ceiling/wall mount, controller-managed",            "mfr": "Ubiquiti",                "model": "U6-Lite",          "qty": 4,  "min_stock": 1,  "crit": "important", "loc": "Room 2", "shelf": "D1", "bin": "03", "tags": ["wifi6","access-point","poe","indoor","ubiquiti"], "weight": 0.300},
    {"cat": "NET", "name": "Travel Router (OpenWrt, Wi-Fi 6)","short": "GL.iNet Travel Router","desc": "Dual-band Wi-Fi 6, OpenWrt pre-installed, WireGuard/OpenVPN, USB tethering, 512MB RAM",                 "mfr": "GL.iNet",                 "model": "GL-AXT1800",       "qty": 6,  "min_stock": 2,  "crit": "important", "loc": "Room 2", "shelf": "D2", "bin": "01", "tags": ["router","openwrt","vpn","travel","wifi6"], "weight": 0.215},
    {"cat": "NET", "name": "PoE Injector (802.3af, 15W)",     "short": "PoE Injector 15W",    "desc": "Single-port 802.3af PoE injector, 10/100/1000, 15W, desktop form factor",                                "mfr": "TP-Link",                 "model": "TL-POE150S",       "qty": 8,  "min_stock": 3,  "crit": "routine",   "loc": "Room 2", "shelf": "D2", "bin": "02", "tags": ["poe","injector","802.3af","power","ethernet"], "weight": 0.175},

    # ── POWER > PORTABLE POWER ─────────────────────────────────────────
    {"cat": "PPW", "name": "Power Bank 20000mAh (USB-C PD)",  "short": "20Ah PD Power Bank",  "desc": "20000mAh Li-polymer, USB-C PD 65W in/out, 2× USB-A QC 3.0, LED indicator, airline-safe",                "mfr": "Anker",                   "model": "A1291",            "qty": 20, "min_stock": 5,  "crit": "important", "loc": "Room 3", "shelf": "A1", "bin": "01", "tags": ["power-bank","20000mah","usb-c","pd","portable"], "weight": 0.454},
    {"cat": "PPW", "name": "Power Bank 10000mAh (Compact)",   "short": "10Ah Compact Bank",   "desc": "10000mAh Li-polymer, USB-C 20W PD, USB-A 18W QC, pocket-size, 180g",                                    "mfr": "Anker",                   "model": "A1259",            "qty": 15, "min_stock": 5,  "crit": "routine",   "loc": "Room 3", "shelf": "A1", "bin": "02", "tags": ["power-bank","10000mah","compact","pocket","travel"], "weight": 0.180},
    {"cat": "PPW", "name": "18650 Li-Ion Battery (3500mAh)",  "short": "18650 3500mAh Cell",  "desc": "Protected 18650 cell, 3.7V 3500mAh, button-top, for torches and battery packs",                          "mfr": "Samsung",                 "model": "INR18650-35E",     "qty": 40, "min_stock": 10, "crit": "routine",   "loc": "Room 3", "shelf": "A1", "bin": "03", "tags": ["battery","18650","li-ion","cell","rechargeable"], "weight": 0.050, "consumable": True},
    {"cat": "PPW", "name": "AA Rechargeable Battery Pack (4×)","short": "AA NiMH 4-Pack",     "desc": "4× AA NiMH 2500mAh, pre-charged, 500+ cycle life",                                                      "mfr": "Panasonic Eneloop",       "model": "BK-3MCCE/4BE",     "qty": 20, "min_stock": 8,  "crit": "routine",   "loc": "Room 3", "shelf": "A2", "bin": "01", "tags": ["battery","aa","nimh","rechargeable","eneloop"], "weight": 0.120, "consumable": True},

    # ── POWER > MAINS & FIXED POWER ───────────────────────────────────
    {"cat": "MPW", "name": "USB-C PD Charger (65W GaN)",      "short": "65W GaN USB-C PSU",   "desc": "Single USB-C port, 65W PD 3.0, GaN technology, foldable UK plug, 100–240V",                             "mfr": "Anker",                   "model": "A2663",            "qty": 15, "min_stock": 5,  "crit": "routine",   "loc": "Room 3", "shelf": "B1", "bin": "01", "tags": ["charger","usb-c","65w","gan","pd"], "weight": 0.120},
    {"cat": "MPW", "name": "USB-C PD Charger (140W GaN, 3-Port)","short": "140W 3-Port GaN", "desc": "USB-C1 140W + USB-C2 30W + USB-A 18W, GaN III, 100–240V, UK plug",                                       "mfr": "Anker",                   "model": "A2688",            "qty": 6,  "min_stock": 2,  "crit": "important", "loc": "Room 3", "shelf": "B1", "bin": "02", "tags": ["charger","usb-c","140w","multi-port","gan"], "weight": 0.232},
    {"cat": "MPW", "name": "12V DC Regulated PSU (5A)",        "short": "12V 5A DC Supply",   "desc": "Regulated 12V DC, 5A (60W), 2.1mm barrel connector, short-circuit protection, 100–240V input",           "mfr": "Mean Well",               "model": "GST60A12-P1J",     "qty": 10, "min_stock": 3,  "crit": "routine",   "loc": "Room 3", "shelf": "B1", "bin": "03", "tags": ["psu","12v","dc","regulated","barrel"], "weight": 0.370},
    {"cat": "MPW", "name": "5V DC Power Supply (3A, USB-C)",  "short": "5V 3A USB-C PSU",     "desc": "Official Raspberry Pi 5V 3A USB-C power supply, 1.5m cable, white",                                      "mfr": "Raspberry Pi Foundation", "model": "SC0218",           "qty": 20, "min_stock": 5,  "crit": "routine",   "loc": "Room 3", "shelf": "B2", "bin": "01", "tags": ["psu","5v","usb-c","rpi","power"], "weight": 0.090},
    {"cat": "MPW", "name": "UPS 850VA / 520W (Desktop)",      "short": "850VA Desktop UPS",   "desc": "850VA/520W line-interactive UPS, 6 outlets (3 battery + 3 surge), USB monitoring, AVR",                   "mfr": "APC",                     "model": "BX850MI",          "qty": 2,  "min_stock": 1,  "crit": "critical",  "loc": "Room 3", "shelf": "B2", "bin": "02", "tags": ["ups","battery-backup","surge","apc","power-protection"], "weight": 5.600, "approval": True},
    {"cat": "MPW", "name": "4-Way Extension Lead (Surge, 2m)","short": "4-Way Surge Strip 2m","desc": "4× UK sockets, surge protection, 2-metre cable, individual switches, 13A rated",                          "mfr": "Belkin",                  "model": "BSV400AF2M",       "qty": 10, "min_stock": 4,  "crit": "routine",   "loc": "Room 3", "shelf": "B2", "bin": "03", "tags": ["extension","surge","power-strip","mains","uk-plug"], "weight": 0.600},

    # ── POWER > SOLAR & RENEWABLE ──────────────────────────────────────
    {"cat": "SOL", "name": "Foldable Solar Panel (60W)",       "short": "60W Foldable Solar",  "desc": "Monocrystalline 60W, USB-C PD 45W + USB-A 18W, foldable 4-panel, kickstand, IPX4",                      "mfr": "Jackery",                 "model": "SolarSaga-60",     "qty": 4,  "min_stock": 1,  "crit": "important", "loc": "Room 3", "shelf": "C1", "bin": "01", "tags": ["solar","panel","foldable","60w","field-power"], "weight": 2.760, "approval": True},
    {"cat": "SOL", "name": "Solar Charge Controller (20A PWM)","short": "20A PWM Controller",  "desc": "12V/24V auto-detect, 20A PWM, LCD display, dual USB 5V output, battery type selector",                  "mfr": "Renogy",                  "model": "RNG-CTRL-WDR20",   "qty": 4,  "min_stock": 1,  "crit": "routine",   "loc": "Room 3", "shelf": "C1", "bin": "02", "tags": ["solar","controller","pwm","12v","charging"], "weight": 0.200},

    # ── TEST, TOOLS & ACCESSORIES > TEST & MEASUREMENT ─────────────────
    {"cat": "TST", "name": "Digital Multimeter (True RMS)",    "short": "True RMS DMM",        "desc": "True RMS, CAT III 600V, AC/DC voltage, current, resistance, capacitance, frequency, continuity, backlit","mfr": "Fluke",                   "model": "115",              "qty": 6,  "min_stock": 2,  "crit": "critical",  "loc": "Room 4", "shelf": "A1", "bin": "01", "tags": ["multimeter","fluke","true-rms","test","electrical"], "weight": 0.320},
    {"cat": "TST", "name": "Network Cable Tester (Cat5/6/7)", "short": "Cat5/6/7 Tester",     "desc": "RJ45 + RJ11 cable tester, auto-scan, wire map, length measurement, tone generator, PoE detection",       "mfr": "Klein Tools",             "model": "VDV526-200",       "qty": 4,  "min_stock": 2,  "crit": "important", "loc": "Room 4", "shelf": "A1", "bin": "02", "tags": ["tester","cable","rj45","network","poe-detect"], "weight": 0.340},
    {"cat": "TST", "name": "Fibre Optic Light Source & Meter", "short": "Fibre Test Kit",     "desc": "850/1300nm multimode light source + optical power meter, SC/LC adapters, carry case",                    "mfr": "Fluke Networks",          "model": "FTK1000",          "qty": 2,  "min_stock": 1,  "crit": "important", "loc": "Room 4", "shelf": "A1", "bin": "03", "tags": ["fibre","optic","test","power-meter","multimode"], "weight": 0.900, "approval": True},
    {"cat": "TST", "name": "USB Power Meter (Inline)",         "short": "USB Power Monitor",  "desc": "USB-C inline tester, voltage/current/power/energy, PD trigger, colour OLED display",                     "mfr": "ChargerLAB",              "model": "KM003C",           "qty": 4,  "min_stock": 2,  "crit": "routine",   "loc": "Room 4", "shelf": "A2", "bin": "01", "tags": ["usb","power-meter","pd","test","inline"], "weight": 0.028},
    {"cat": "TST", "name": "Thermal Imaging Camera (Handheld)","short": "Handheld IR Camera", "desc": "160×120 IR resolution, -20°C to 400°C, 3.5\" touchscreen, Wi-Fi image transfer, micro-USB charging",     "mfr": "FLIR",                    "model": "C5",               "qty": 2,  "min_stock": 1,  "crit": "important", "loc": "Room 4", "shelf": "A2", "bin": "02", "tags": ["thermal","ir","camera","inspection","flir"], "weight": 0.190, "approval": True},

    # ── TEST, TOOLS & ACCESSORIES > PROTECTIVE CASES & STORAGE ─────────
    {"cat": "CAS", "name": "Pelican Case 1500 (Medium)",       "short": "Pelican 1500 Case",  "desc": "Watertight, crushproof, dustproof, padded dividers, automatic pressure equalisation valve",              "mfr": "Pelican",                 "model": "1500-004-110",     "qty": 6,  "min_stock": 2,  "crit": "important", "loc": "Room 4", "shelf": "B1", "bin": "01", "tags": ["case","pelican","waterproof","protective","medium"], "weight": 3.200},
    {"cat": "CAS", "name": "Pelican Case 1200 (Small)",        "short": "Pelican 1200 Case",  "desc": "Watertight, crushproof, dustproof, pick-and-pluck foam, stainless padlock protectors",                    "mfr": "Pelican",                 "model": "1200-000-110",     "qty": 8,  "min_stock": 3,  "crit": "routine",   "loc": "Room 4", "shelf": "B1", "bin": "02", "tags": ["case","pelican","waterproof","protective","small"], "weight": 1.400},
    {"cat": "CAS", "name": "Padded Equipment Bag (40L)",       "short": "40L Padded Kit Bag",  "desc": "Padded 40L bag, modular internal dividers, shoulder strap + handles, 600D polyester, lockable zips",     "mfr": "5.11 Tactical",           "model": "56621",            "qty": 6,  "min_stock": 2,  "crit": "routine",   "loc": "Room 4", "shelf": "B1", "bin": "03", "tags": ["bag","padded","40l","tactical","transport"], "weight": 1.100},
    {"cat": "CAS", "name": "Anti-Static Bags (100-pack)",      "short": "ESD Bags 100pk",     "desc": "100× anti-static shielding bags, 150×200mm, resealable, for PCBs and sensitive components",              "mfr": "Kingwin",                 "model": "ATS-B150",         "qty": 10, "min_stock": 3,  "crit": "routine",   "loc": "Room 4", "shelf": "B2", "bin": "01", "tags": ["esd","anti-static","bags","packaging","protection"], "weight": 0.250, "consumable": True},

    # ── TEST, TOOLS & ACCESSORIES > ADAPTERS & CONVERTERS ──────────────
    {"cat": "ADP", "name": "HDMI to VGA Adapter (Active)",     "short": "HDMI→VGA Adapter",   "desc": "Active HDMI male to VGA female converter, 3.5mm audio output, USB micro-B power, 1080p",                "mfr": "StarTech",                "model": "HD2VGAA2",         "qty": 10, "min_stock": 3,  "crit": "routine",   "loc": "Room 4", "shelf": "C1", "bin": "01", "tags": ["adapter","hdmi","vga","video","converter"], "weight": 0.040},
    {"cat": "ADP", "name": "USB-C to Ethernet Adapter (GbE)", "short": "USB-C→GbE Adapter",   "desc": "USB-C to RJ45 Gigabit Ethernet, USB 3.1 Gen 1, aluminium, driver-free on Linux/macOS/Windows",          "mfr": "Anker",                   "model": "A8313",            "qty": 8,  "min_stock": 3,  "crit": "routine",   "loc": "Room 4", "shelf": "C1", "bin": "02", "tags": ["adapter","usb-c","ethernet","gigabit","network"], "weight": 0.020},
    {"cat": "ADP", "name": "DisplayPort to HDMI Adapter",      "short": "DP→HDMI Adapter",    "desc": "DisplayPort 1.4 male to HDMI 2.0 female, 4K60, passive, latching connector",                             "mfr": "StarTech",                "model": "DP2HDMI4K60",      "qty": 8,  "min_stock": 3,  "crit": "routine",   "loc": "Room 4", "shelf": "C1", "bin": "03", "tags": ["adapter","displayport","hdmi","video","4k"], "weight": 0.030},
    {"cat": "ADP", "name": "M.2 NVMe to USB-C Enclosure",     "short": "NVMe USB-C Enclosure","desc": "M.2 2230/2242/2260/2280, USB 3.2 Gen 2 (10Gbps), tool-free, UASP, aluminium heatsink",                   "mfr": "Sabrent",                 "model": "EC-SNVE",          "qty": 4,  "min_stock": 2,  "crit": "routine",   "loc": "Room 4", "shelf": "C1", "bin": "04", "tags": ["enclosure","nvme","usb-c","storage","external"], "weight": 0.065},

    # ── TEST, TOOLS & ACCESSORIES > TOOLS & CONSUMABLES ────────────────
    {"cat": "TOL", "name": "Precision Screwdriver Set (24-in-1)","short": "24pc Screwdriver Kit","desc": "24 interchangeable bits (Phillips, Torx, hex, pentalobe, tri-wing), magnetic driver, aluminium case", "mfr": "iFixit",                  "model": "IF145-299",        "qty": 6,  "min_stock": 2,  "crit": "routine",   "loc": "Room 4", "shelf": "D1", "bin": "01", "tags": ["tools","screwdriver","precision","ifixit","repair"], "weight": 0.175},
    {"cat": "TOL", "name": "Wire Stripper & Crimper (RJ45)",   "short": "RJ45 Crimp Tool",    "desc": "Pass-through RJ45 crimp tool, strip, cut, and crimp Cat5e/Cat6/Cat6a, ratcheted action",                "mfr": "Klein Tools",             "model": "VDV226-110",       "qty": 4,  "min_stock": 2,  "crit": "important", "loc": "Room 4", "shelf": "D1", "bin": "02", "tags": ["tools","crimper","rj45","ethernet","cable-making"], "weight": 0.280},
    {"cat": "TOL", "name": "RJ45 Cat6a Plugs (50-pack)",       "short": "Cat6a RJ45 Plugs 50pk","desc": "Shielded pass-through Cat6a RJ45 connectors, gold-plated contacts, 50-piece bag",                      "mfr": "Klein Tools",             "model": "VDV826-763",       "qty": 10, "min_stock": 5,  "crit": "routine",   "loc": "Room 4", "shelf": "D1", "bin": "03", "tags": ["connector","rj45","cat6a","shielded","consumable"], "weight": 0.150, "consumable": True},
    {"cat": "TOL", "name": "Cable Tie Assortment (500-pack)",  "short": "Cable Ties 500pk",   "desc": "500× nylon cable ties, assorted lengths (100/150/200/300mm), black, UV-resistant",                        "mfr": "Hellermann Tyton",        "model": "T18R-500",         "qty": 15, "min_stock": 5,  "crit": "routine",   "loc": "Room 4", "shelf": "D2", "bin": "01", "tags": ["cable-ties","consumable","nylon","assorted","management"], "weight": 0.500, "consumable": True},
    {"cat": "TOL", "name": "Label Maker (Handheld, 12mm)",    "short": "12mm Label Maker",    "desc": "Handheld thermal label printer, 12mm tape width, QWERTY keyboard, auto-cutter, battery/USB powered",     "mfr": "Brother",                 "model": "PT-H110",          "qty": 3,  "min_stock": 1,  "crit": "routine",   "loc": "Room 4", "shelf": "D2", "bin": "02", "tags": ["label-maker","thermal","12mm","identification","asset-tag"], "weight": 0.390},
    {"cat": "TOL", "name": "Soldering Station (Temperature Controlled)","short": "Temp-Ctrl Solder Stn","desc": "60W adjustable 200–480°C, ESD-safe, ceramic heater, digital display, sleep mode, includes stand + sponge","mfr": "Hakko",   "model": "FX-888D",          "qty": 2,  "min_stock": 1,  "crit": "important", "loc": "Room 4", "shelf": "D2", "bin": "03", "tags": ["soldering","station","esd-safe","repair","rework"], "weight": 2.100, "approval": True},
    {"cat": "TOL", "name": "Solder Wire 60/40 (0.8mm, 100g)", "short": "Solder 0.8mm 100g",  "desc": "60/40 tin/lead rosin-core solder, 0.8mm diameter, 100g spool",                                            "mfr": "MG Chemicals",            "model": "4884-100G",        "qty": 6,  "min_stock": 3,  "crit": "routine",   "loc": "Room 4", "shelf": "D2", "bin": "04", "tags": ["solder","consumable","60-40","rosin-core","0.8mm"], "weight": 0.100, "consumable": True},
]


# ══════════════════════════════════════════════════════════════════════════
# SEED FUNCTIONS
# ══════════════════════════════════════════════════════════════════════════


async def _seed_users(db: AsyncSession) -> dict[str, int]:
    """Create users and return a {username: id} mapping."""
    user_map: dict[str, int] = {}

    for u in _USERS:
        user = User(
            username=u["username"],
            email=u["email"],
            hashed_password=hash_password(u["password"]),
            full_name=u["full_name"],
            rank=u["rank"],
            role=u["role"],
            service_number=u.get("service_number", ""),
            must_change_password=True,
            is_active=True,
            # Notification preferences — all enabled by default
            notify_in_app=True,
            notify_signouts=True,
            notify_resupply=True,
            notify_overdue=True,
            notify_low_stock=True,
            notify_access=True,
        )
        db.add(user)
        await db.flush()
        user_map[u["username"]] = user.id

    logger.info("  ✓ Created %d users", len(user_map))
    return user_map


async def _seed_categories(db: AsyncSession) -> dict[str, int]:
    """
    Create the category hierarchy and return a {code: id} mapping.

    Top-level categories are created first, then children with
    ``parent_id`` pointing to their parent.
    """
    code_to_id: dict[str, int] = {}

    for top in _TOP_CATEGORIES:
        parent = Category(
            name=top["name"],
            code=top["code"],
            description=top["description"],
            icon=top.get("icon", ""),
            colour=top.get("colour", ""),
            sort_order=top.get("sort_order", 0),
            parent_id=None,
        )
        db.add(parent)
        await db.flush()
        code_to_id[top["code"]] = parent.id

        for child in top.get("children", []):
            sub = Category(
                name=child["name"],
                code=child["code"],
                description=child["description"],
                icon=child.get("icon", ""),
                colour=top.get("colour", ""),  # inherit parent colour
                sort_order=child.get("sort_order", 0),
                parent_id=parent.id,
            )
            db.add(sub)
            await db.flush()
            code_to_id[child["code"]] = sub.id

    total_cats = sum(1 + len(t.get("children", [])) for t in _TOP_CATEGORIES)
    logger.info(
        "  ✓ Created %d categories (%d top-level, %d subcategories)",
        total_cats,
        len(_TOP_CATEGORIES),
        total_cats - len(_TOP_CATEGORIES),
    )
    return code_to_id


async def _seed_items(
    db: AsyncSession,
    cat_map: dict[str, int],
    admin_id: int,
) -> int:
    """
    Create all inventory items with clean starting stock.

    Every item starts with:
        available_quantity   = total_quantity
        serviceable_count    = total_quantity
        unserviceable_count  = 0
        damaged_count        = 0
        condemned_count      = 0
        checked_out_count    = 0

    Item codes are generated as ``G4L-{CAT_CODE}-{SEQ:03d}`` where
    SEQ resets per subcategory.
    """
    # Track sequence numbers per subcategory code
    seq_counters: dict[str, int] = {}
    created = 0

    for item_def in _ITEMS:
        cat_code = item_def["cat"]
        cat_id = cat_map.get(cat_code)
        if cat_id is None:
            logger.warning(
                "  ⚠ Skipping item '%s' — unknown category code '%s'",
                item_def["name"],
                cat_code,
            )
            continue

        # Generate sequential item code
        seq_counters[cat_code] = seq_counters.get(cat_code, 0) + 1
        item_code = f"G4L-{cat_code}-{seq_counters[cat_code]:03d}"

        qty = item_def["qty"]

        _CRITICALITY_MAP = {
        "routine": "low",
        "important": "medium",
        "critical": "critical",
        "essential": "high",
    }

        item = Item(
            item_code=item_code,
            name=item_def["name"],
            short_description=item_def.get("short", ""),
            description=item_def.get("desc", ""),
            manufacturer=item_def.get("mfr", ""),
            model_number=item_def.get("model", ""),
            category_id=cat_id,
            # ── Quantities — all clean ──
            total_quantity=qty,
            available_quantity=qty,
            serviceable_count=qty,
            unserviceable_count=0,
            damaged_count=0,
            condemned_count=0,
            checked_out_count=0,
            # ── Stock management ──
            minimum_stock_level=item_def.get("min_stock", 0),
            criticality=_CRITICALITY_MAP.get(item_def.get("crit", "routine"), "medium"),
            # ── Physical location ──
            storage_location=item_def.get("loc", ""),
            shelf=item_def.get("shelf", ""),
            bin=item_def.get("bin", ""),
            # ── Metadata ──
            tags=",".join(item_def.get("tags", [])),
            is_consumable=item_def.get("consumable", False),
            requires_approval=item_def.get("approval", False),
            weight_grams=item_def.get("weight", 0) * 1000 if item_def.get("weight") else None,
            # ── Audit ──
            created_by=admin_id,
        )
        db.add(item)
        created += 1

    await db.flush()
    logger.info("  ✓ Created %d inventory items", created)
    return created


async def run_seed() -> None:
    """
    Main seed entry point — idempotent.

    Checks whether users already exist in the database.  If they do,
    the seed is skipped entirely to prevent duplicate data.

    Called from:
        - ``python -m app.seed`` (CLI)
        - ``app.main`` lifespan when ``SEED_ON_STARTUP=True``
    """
    logger.info("─── Seed script starting ───")

    async with get_standalone_session() as db:
        # --- Idempotency check ---
        count = await db.scalar(select(func.count(User.id)))
        if count and count > 0:
            logger.info(
                "Database already contains %d user(s) — skipping seed.", count
            )
            return

        # --- Seed data ---
        user_map = await _seed_users(db)
        cat_map = await _seed_categories(db)

        admin_id = user_map.get("admin")
        if admin_id is None:
            raise RuntimeError("Admin user was not created — seed aborted")

        item_count = await _seed_items(db, cat_map, admin_id)

        # Commit is handled by get_standalone_session context manager
        logger.info(
            "─── Seed complete: %d users, %d categories, %d items ───",
            len(user_map),
            len(cat_map),
            item_count,
        )


# ---------------------------------------------------------------------------
# CLI entry point:  python -m app.seed
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    async def _main() -> None:
        # When running standalone, we need to initialise the database layer
        # because the FastAPI lifespan hasn't run.
        await init_db()
        await run_seed()

    asyncio.run(_main())