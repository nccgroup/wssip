require "language/node"

class Wssip < Formula
  desc "Proxy application for manipulating WebSocket messages"
  homepage "https://github.com/nccgroup/wssip"
  url "https://registry.npmjs.org/wssip/-/wssip-1.0.6.tgz"
  version "1.0.6"
  sha256 "84e3589e2ba8f3e4dfff49421feba770bc21e723526c145300f753b9979a81bd"
  head "https://github.com/nccgroup/wssip.git"

  bottle :unneeded

  depends_on "node"

  def install
    system "npm", "install", "--production", *Language::Node.std_npm_install_args(libexec)
    bin.install_symlink "#{libexec}/bin/wssip" => "wssip"
  end

  test do
    vers = system bin/"wssip", "--version"
    assert_equal vers, '1.0.6'
  end
end
