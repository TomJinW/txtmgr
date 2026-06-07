#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import json
import re
import sys
from pathlib import Path


TIME_RE = re.compile(
    r"^\s*\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}.*$"
)


ENCODING_CHOICES = [
    "utf-8",
    "utf-8-sig",
    "utf-16",
    "utf-16-le",
    "utf-16-be",
    "cp932",
    "cp949",
    "gb18030",
    "big5",
]


def read_text_auto(path: Path) -> str:
    data = path.read_bytes()

    if data.startswith(b"\xff\xfe") or data.startswith(b"\xfe\xff"):
        return data.decode("utf-16")

    if data.startswith(b"\xef\xbb\xbf"):
        return data.decode("utf-8-sig")

    for encoding in (
        "utf-8",
        "cp932",
        "cp949",
        "gb18030",
        "big5",
    ):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            pass

    return data.decode("utf-8", errors="replace")


def parse_srt(text: str) -> list[dict]:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    blocks = re.split(r"\n\s*\n", text.strip())

    results = []

    for block in blocks:
        lines = block.split("\n")
        if not lines:
            continue

        time_index = None

        for i, line in enumerate(lines):
            if TIME_RE.match(line):
                time_index = i
                break

        if time_index is None:
            continue

        timeline = lines[time_index].strip()
        subtitle = "\n".join(lines[time_index + 1:]).strip()

        results.append({
            "Sentence": {
                "title_addr": timeline,
                "original_text": subtitle,
                "translated_text": subtitle,
                "note": "",
                "state": "",
                "file_name": "",
            }
        })

    return results


def srt_to_json(input_path: Path, output_path: Path) -> None:
    text = read_text_auto(input_path)
    data = parse_srt(text)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def json_to_srt(
    input_path: Path,
    output_path: Path,
    output_encoding: str = "utf-8",
    bilingual: bool = False,
) -> None:
    text = read_text_auto(input_path)
    data = json.loads(text)

    blocks = []

    for index, item in enumerate(data, start=1):
        sentence = item.get("Sentence", {})

        timeline = sentence.get("title_addr", "").strip()
        original = sentence.get("original_text", "").strip()
        translated = sentence.get("translated_text", "").strip()

        if not timeline:
            continue

        if bilingual:
            subtitle_lines = []

            if translated:
                subtitle_lines.append(translated)

            if original:
                subtitle_lines.append(original)

            subtitle = "\n".join(subtitle_lines)
        else:
            subtitle = translated or original

        blocks.append(
            f"{index}\n{timeline}\n{subtitle}"
        )

    output_text = "\n\n".join(blocks) + "\n"

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(output_text, encoding=output_encoding)


# ============================================================
# GUI
# ============================================================

def run_gui() -> int:
    import wx

    class MainFrame(wx.Frame):
        def __init__(self):
            super().__init__(
                None,
                title="Subtitle JSON Tool",
                size=(760, 420),
            )

            panel = wx.Panel(self)
            main = wx.BoxSizer(wx.VERTICAL)

            self.mode_choice = wx.RadioBox(
                panel,
                label="Mode",
                choices=[
                    "SRT to JSON",
                    "JSON to SRT",
                ],
                majorDimension=1,
                style=wx.RA_SPECIFY_ROWS,
            )

            self.input_text = wx.TextCtrl(panel)
            self.output_text = wx.TextCtrl(panel)

            input_btn = wx.Button(panel, label="Browse...")
            output_btn = wx.Button(panel, label="Browse...")

            input_btn.Bind(wx.EVT_BUTTON, self.on_browse_input)
            output_btn.Bind(wx.EVT_BUTTON, self.on_browse_output)

            input_row = wx.BoxSizer(wx.HORIZONTAL)
            input_row.Add(self.input_text, 1, wx.EXPAND | wx.RIGHT, 5)
            input_row.Add(input_btn)

            output_row = wx.BoxSizer(wx.HORIZONTAL)
            output_row.Add(self.output_text, 1, wx.EXPAND | wx.RIGHT, 5)
            output_row.Add(output_btn)

            self.encoding_choice = wx.Choice(
                panel,
                choices=ENCODING_CHOICES,
            )
            self.encoding_choice.SetStringSelection("utf-8")

            self.bilingual_checkbox = wx.CheckBox(
                panel,
                label="Dual language sub for JSON to SRT：translated_text + original_text",
            )

            self.convert_btn = wx.Button(panel, label="Convert")
            self.convert_btn.Bind(wx.EVT_BUTTON, self.on_convert)

            self.status_text = wx.StaticText(panel, label="Ready.")

            main.Add(self.mode_choice, 0, wx.EXPAND | wx.ALL, 8)

            main.Add(wx.StaticText(panel, label="Input file:"), 0, wx.LEFT | wx.RIGHT | wx.TOP, 8)
            main.Add(input_row, 0, wx.EXPAND | wx.LEFT | wx.RIGHT | wx.BOTTOM, 8)

            main.Add(wx.StaticText(panel, label="Output file:"), 0, wx.LEFT | wx.RIGHT | wx.TOP, 8)
            main.Add(output_row, 0, wx.EXPAND | wx.LEFT | wx.RIGHT | wx.BOTTOM, 8)

            main.Add(wx.StaticText(panel, label="JSON to SRT output encoding:"), 0, wx.LEFT | wx.RIGHT | wx.TOP, 8)
            main.Add(self.encoding_choice, 0, wx.EXPAND | wx.LEFT | wx.RIGHT | wx.BOTTOM, 8)

            main.Add(self.bilingual_checkbox, 0, wx.ALL, 8)
            main.Add(self.convert_btn, 0, wx.ALL | wx.ALIGN_RIGHT, 8)
            main.Add(self.status_text, 0, wx.ALL, 8)

            panel.SetSizer(main)

        def on_browse_input(self, event):
            mode = self.mode_choice.GetSelection()

            if mode == 0:
                wildcard = "SRT files (*.srt)|*.srt|All files (*.*)|*.*"
                title = "Select SRT"
            else:
                wildcard = "JSON files (*.json)|*.json|All files (*.*)|*.*"
                title = "Select JSON"

            with wx.FileDialog(
                self,
                title,
                wildcard=wildcard,
                style=wx.FD_OPEN | wx.FD_FILE_MUST_EXIST,
            ) as dlg:
                if dlg.ShowModal() == wx.ID_OK:
                    self.input_text.SetValue(dlg.GetPath())

        def on_browse_output(self, event):
            mode = self.mode_choice.GetSelection()

            if mode == 0:
                wildcard = "JSON files (*.json)|*.json|All files (*.*)|*.*"
                default_file = "output.json"
                title = "Save JSON"
            else:
                wildcard = "SRT files (*.srt)|*.srt|All files (*.*)|*.*"
                default_file = "output.srt"
                title = "Save SRT"

            with wx.FileDialog(
                self,
                title,
                wildcard=wildcard,
                defaultFile=default_file,
                style=wx.FD_SAVE | wx.FD_OVERWRITE_PROMPT,
            ) as dlg:
                if dlg.ShowModal() == wx.ID_OK:
                    self.output_text.SetValue(dlg.GetPath())

        def on_convert(self, event):
            input_path = Path(self.input_text.GetValue())
            output_path = Path(self.output_text.GetValue())

            if not input_path.exists():
                wx.MessageBox("Input file not found.", "Error", wx.OK | wx.ICON_ERROR)
                return

            if not str(output_path):
                wx.MessageBox("Please choose output file.", "Error", wx.OK | wx.ICON_ERROR)
                return

            try:
                mode = self.mode_choice.GetSelection()

                if mode == 0:
                    srt_to_json(input_path, output_path)
                else:
                    encoding = self.encoding_choice.GetStringSelection()
                    bilingual = self.bilingual_checkbox.GetValue()

                    json_to_srt(
                        input_path,
                        output_path,
                        output_encoding=encoding,
                        bilingual=bilingual,
                    )

                self.status_text.SetLabel(f"Done: {output_path}")
                wx.MessageBox("Conversion completed.", "Success", wx.OK | wx.ICON_INFORMATION)

            except Exception as e:
                wx.MessageBox(str(e), "Error", wx.OK | wx.ICON_ERROR)

    app = wx.App(False)
    frame = MainFrame()
    frame.Show()
    app.MainLoop()

    return 0


# ============================================================
# CLI
# ============================================================

def run_cli() -> int:
    parser = argparse.ArgumentParser(
        description="Convert between SRT and Sentence JSON."
    )

    subparsers = parser.add_subparsers(dest="command")

    p1 = subparsers.add_parser("srt2json", help="Convert SRT to JSON")
    p1.add_argument("input", help="Input .srt file")
    p1.add_argument("output", help="Output .json file")

    p2 = subparsers.add_parser("json2srt", help="Convert JSON to SRT")
    p2.add_argument("input", help="Input .json file")
    p2.add_argument("output", help="Output .srt file")
    p2.add_argument(
        "--encoding",
        default="utf-8",
        choices=ENCODING_CHOICES,
        help="Output SRT encoding",
    )
    p2.add_argument(
        "--bilingual",
        action="store_true",
        help="Output translated_text first, then original_text",
    )

    parser.add_argument(
        "--gui",
        action="store_true",
        help="Launch GUI",
    )

    args = parser.parse_args()

    if args.gui:
        return run_gui()

    if args.command == "srt2json":
        srt_to_json(Path(args.input), Path(args.output))
        print(f"Converted SRT to JSON: {args.output}")
        return 0

    if args.command == "json2srt":
        json_to_srt(
            Path(args.input),
            Path(args.output),
            output_encoding=args.encoding,
            bilingual=args.bilingual,
        )
        print(f"Converted JSON to SRT: {args.output}")
        return 0

    return run_gui()


def main() -> int:
    if len(sys.argv) == 1:
        return run_gui()

    return run_cli()


if __name__ == "__main__":
    raise SystemExit(main())