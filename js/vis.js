if (! window.AudioContext) {
	if (! window.webkitAudioContext) {
		alert('Could not get audio context! (Are you using IE?)');
	}
	window.AudioContext = window.webkitAudioContext;
}

var colors = {
	'EDM': '#C1C1C1',
	'House': '#EB8200',
	'Drumstep': '#F12188',
	'Drum & Bass': '#FF1900',
	'Trance': '#0080E6',
	'Electro': '#E5CE00',
	'Glitch Hop': '#0A9655',
	'Hardcore': '#009600',
	'Nu Disco': '#16ACB0',
	'Dubstep': '#941DE8',
	'Trap': '#8C0F28',
	'Future Bass': '#B8B8FF',
	'BTC': '#000000'
};
var color;

var song;
var context = new AudioContext();
var audioBuffer;
var bufferSource;
var analyzer;
var scriptProcessor;
var width = $(document).width() * 0.83;
var barMargin = 7;
var spectrumSize = 63;
var barWidth = width / spectrumSize - barMargin;
width -= width % (barWidth + barMargin * 2);
//var spectrumSize = Math.floor(width / (barWidth + barMargin * 2)); // the size of the visible spectrum
var spectrumStart = 6; // the first bin rendered in the spectrum
var spectrumEnd = 320; // the last bin rendered in the spectrum
var spectrumScale = 1.7; // the logarithmic scale to adjust spectrum values to
var maxSpectrumExponent = 5; // the maximum exponent to raise spectrum values to
var minSpectrumExponent = 5; // the minimum exponent to raise spectrum values to
var smoothing = 0.55;
var height = width / 4.5;
var headMargin = 7;
var tailMargin = 7;
var marginDecay = 1.5;
var minMarginWeight = 0.6;
// margin weighting follows a quadratic slope passing through (0, minMarginWeight) and (marginSize, 1)
var headMarginSlope = (1 - minMarginWeight) / Math.pow(headMargin, marginDecay);
var tailMarginSlope = (1 - minMarginWeight) / Math.pow(tailMargin, marginDecay);

var maxFftSize = 16384;

var velMult = 0;

var ampLower = 8; // the lower bound for amplitude analysis (inclusive)
var ampUpper = 30; // the upper bound for amplitude analysis (exclusive)
var particleExponent = 4; // the power to raise velMult to after initial computation
var minParticleVelocity = 0.01; // the lowest multiplier for particle speeds

// dudududududu
var red = 255;
var green = 0;
var blue = 0;
var stage = 0;
var cycleSpeed = 4;

var begun = false;
var ended = false;
var isPlaying = false;
var bufferInterval = 1024;
var started = 0;
var currentTime = 0;
var minProcessPeriod = 18; // ms between calls to the process function

var blockSize = 193;
var blockTopPadding = 50;
var blockSidePadding = 30;
var blockWidthRatio = 0.63;
var blockHeightRatio = 0.73;

var lastMouseMove = Date.now();
var mouseSleepTime = 2000;
var textHidden = false;

$('#canvas').attr('width', width);
$('#canvas').attr('height', height + blockSize + 2 * blockTopPadding);
$('#songinfo').css('margin-top', -blockSize - blockTopPadding - 12);
$('#songinfo').css('margin-left', blockSize + blockSidePadding);
$('#songinfo').css('width', width - blockSize - blockSidePadding);
var ctx = $("#canvas").get()[0].getContext("2d");

function centerContent() {
	$('.content').css('margin-top', ($(document).height() - $('.content').height()) * 0.38);
	$('.content').css('margin-left', ($(document).width() - $('.content').width()) / 2);
};	

$(window).resize(function() {
	centerContent();
});

loadSong();
setupAudioNodes();
loadSound('music/' + song.getFileName()); // music file
$('#songinfo').css('padding-top', (blockSize - $('#songinfo').height()) / 2);
centerContent();

if (song.getGenre() == 'ayy lmao') {
	$('.ayylmao').show();
	$('.kitty').css('margin-top', -blockSize + blockTopPadding - 21);
	$('.kitty').attr('height', blockSize);
}

$('html').mousemove(function(event) {
	if (textHidden) {
		$('.hide').show();
		textHidden = false;
	}
	lastMouseMove = Date.now();
});

function loadSong() {
	var songs = [];
	var count = 0;
	var loc = window.location.pathname;
	var prefix = 'http://' + window.location.hostname + loc.substring(0, loc.lastIndexOf('/'));
	var path = prefix + '/songs.csv';
	$.ajax({
		url:		path,
		success:	function(csv) {
						var lines = csv.split('\n');
						for (var i = 0; i < lines.length; i++) {
							try {
								var s = new Song(lines[i]);
								songs[s.getId()] = s;
								count = count + 1;
							} catch (ex) {} // not a song
						}
						songs.splice('undefined', 1);
					},
		async:		false
	});
	var keys = Object.keys(songs);
	if (songName !== undefined) {
		song = songs[songName.toLowerCase()];
	} else if (genreName !== undefined) {
		var genreArray = [];
		var i = 0;
		keys.forEach(function(key) {
			var song = songs[key];
			if (song.getGenre().toLowerCase() === genreName.toLowerCase()) {
				genreArray[i] = song;
				++i;
			}
		})
		song = genreArray[Math.floor(Math.random() * genreArray.length)];
	} else if (artistName !== undefined) {
		var artistArray = [];
		var i = 0;
		keys.forEach(function(key) {
			var song = songs[key];
			if (song.getArtist().toLowerCase() === artistName.toLowerCase()) {
				artistArray[i] = song;
				++i;
			}
		})
		song = artistArray[Math.floor(Math.random() * artistArray.length)];
	} else {
		var key = keys[Math.floor(Math.random() * count)];
		song = songs[key];
	}
	document.getElementById('artist').innerHTML = '???';
	document.getElementById('title').innerHTML = '???';
	document.title = '[vis.js] ??? \u2014 ???';
	if (song != undefined) {
		var baseArtistHeight = $('#artist').height();
		document.getElementById('artist').innerHTML = selectiveToUpperCase(song.getArtist());
		
		while ($('#artist').height() >= baseArtistHeight) {
			$('#artist').css('font-size', ($('#artist').css('font-size').replace('px', '') - 1) + 'px');
		}
		$('#artist').css('font-size', ($('#artist').css('font-size').replace('px', '') - 5) + 'px');
		var baseTitleHeight = $('#title').height();
		document.getElementById('title').innerHTML =
				(song.getLink() != null ? '<a href="' + song.getLink() + '" target="_blank">' : '')
				+ selectiveToUpperCase(song.getTitle())
				+ (song.getLink() != null ? '</a>' : '');
		var newLines = (song.getTitle().length - song.getTitle().replace('<br>', '').replace('^', '').length) / 4 + 1;
		while ($('#title').height() >= baseTitleHeight * newLines) {
			$('#title').css('font-size', ($('#title').css('font-size').replace('px', '') - 1) + 'px');
		}
			$('#title').css('font-size', ($('#title').css('font-size').replace('px', '') - 5) + 'px');
		document.title = '[vis.js] ' + song.getArtist().replace('^', '') + ' \u2014 ' + song.getTitle().replace('<br>', ' ').replace('^', '');
		color = colors[song.getGenre()];
	}
	if (color == undefined) {
		color = colors['EDM']
	}
	
	if (!song || song.getGenre() != 'ayy lmao') {
		drawBlock();
	}

	if (song.getGenre() == 'BTC') {
		$('html').css('backgroundColor', '#E8E8E8');
		$('.content #artist').css('color', '#000');
		$('.content #title a').css('color', '#000');
	}
}

function drawBlock() {
	ctx.fillStyle = color;
	ctx.fillRect(0, height + blockTopPadding, blockSize, blockSize);
	var img = new Image();
	img.onload = function() {
		ctx.fillStyle = 'white';
		ctx.drawImage(
			img,
			blockSize * (1 - blockWidthRatio) / 2,
			height + blockTopPadding + (blockSize * (1 - blockHeightRatio) / 2),
			blockSize * blockWidthRatio,
			blockSize * blockHeightRatio
		);
	}
	var loc = window.location.pathname;
	var prefix = 'http://' + window.location.hostname + loc.substring(0, loc.lastIndexOf('/'));
	img.src = prefix + '/img/mcat.svg';
}

function setupAudioNodes() {
	scriptProcessor = context.createScriptProcessor(bufferInterval, 1, 1);
	scriptProcessor.connect(context.destination);

	analyzer = context.createAnalyser();
	analyzer.connect(scriptProcessor);
	analyzer.smoothingTimeConstant = smoothing;
	//analyzer.minDecibels = -65;
	analyzer.maxDecibels = -28;
	try {
		analyzer.fftSize = maxFftSize; // ideal bin count
		console.log('Using fftSize of ' + analyzer.fftSize + ' (woot!)');
	} catch (ex) {
		analyzer.fftSize = 2048; // this will work for most if not all systems
		console.log('Using fftSize of ' + analyzer.fftSize);
		alert('Could not set optimal fftSize! This may look a bit weird...');
	}

	bufferSource = context.createBufferSource();
	bufferSource.connect(analyzer);
	bufferSource.connect(context.destination);
}

$(document).keypress(function(event) {
	if (event.which == 80 || event.which == 112) {
		if (isPlaying) {
			bufferSource.stop();
			currentTime += Date.now() - started;
			velMult = 0;
		} else {
			var newSource = context.createBufferSource();
			newSource.buffer = bufferSource.buffer;
			bufferSource = newSource
			bufferSource.connect(analyzer);
			bufferSource.connect(context.destination);
			bufferSource.start(0, currentTime / 1000);
			started = Date.now();
		}
		isPlaying = !isPlaying;
	}
});

function loadSound(url) {
	var request = new XMLHttpRequest();
	request.open('GET', url, true);
	request.responseType = 'arraybuffer';

	request.onload = function() {
		context.decodeAudioData(request.response, function(buffer) {
			playSound(buffer);
		}, onError);
	}
	request.send();
}


function playSound(buffer) {
	bufferSource.buffer = buffer;
	bufferSource.start(0);
	$('#status').fadeOut(); // will first fade out the loading animation
	$('#preloader').fadeOut('slow'); // will fade out the grey DIV that covers the website.
	isPlaying = true;
	begun = true;
	started = Date.now();
}

bufferSource.onended = function() {
	if (started && isPlaying) {
		location.reload(); // refresh when the song ends
	}
}

function onError(e) {
	console.log(e);
}

var lastProcess = Date.now();
scriptProcessor.onaudioprocess = function() {
	var now = Date.now();
	do { now = Date.now(); } while (now - lastProcess < minProcessPeriod);
	lastProcess = Date.now();
	
	if (started && !textHidden && Date.now() - lastMouseMove >= mouseSleepTime) {
		$('.hide').fadeOut(500);
		textHidden = true;
	}
	
	var initialArray =  new Uint8Array(analyzer.frequencyBinCount);
	analyzer.getByteFrequencyData(initialArray);
	var array = powerTransform(initialArray);
	ctx.clearRect(0, 0, width, height);
	if (song.getGenre() == 'ayy lmao') {
		switch (stage) {
			case 0:
				if (green < 255) green = Math.min(green + cycleSpeed, 255);
				else ++stage;
				break;
			case 1:
				if (red > 0) red = Math.max(red - cycleSpeed, 0);
				else ++stage;
				break;
			case 2:
				if (blue < 255) blue = Math.min(blue + cycleSpeed, 255);
				else ++stage;
				break;
			case 3:
				if (green > 0) green = Math.max(green - cycleSpeed, 0);
				else ++stage;
				break;
			case 4:
				if (red < 255) red = Math.min(red + cycleSpeed, 255);
				else ++stage;
				break;
			case 5:
				if (blue > 0) blue = Math.max(blue - cycleSpeed, 0);
				else ++stage;
				break;
		}
		if (stage > 5) stage = 0;
		color = 'rgb(' + red + ',' + green + ',' + blue + ')';
	}
	ctx.fillStyle = color; // bar color
	
	drawSpectrum(array);
}

function powerTransform(array) {
	var newArray = new Uint8Array(spectrumSize);
	for (var i = 0; i < spectrumSize; i++) {
		//newArray[i] = array[i + spectrumStart];
		var bin = Math.pow(i / spectrumSize, spectrumScale) * (spectrumEnd - spectrumStart) + spectrumStart;
		newArray[i] = array[Math.floor(bin) + spectrumStart] * (bin % 1)
				+ array[Math.floor(bin + 1) + spectrumStart] * (1 - (bin % 1))
	}
	return newArray;
}

var lastSpectrum = [];
var prevPeak = -1;

function drawSpectrum(array) {
	if (isPlaying && lastSpectrum.length == 1) {
		lastSpectrum = array;
	}

	if (isPlaying) {
		var sum = 0;
		for (var i = ampLower; i < ampUpper; i++) {
			sum += array[i] / height;
		}
		// the next line effecitvely uses the weighted sum to generate a float between 0.0 and 1.0, 1 meaning all
		// amplitude points in the observed range are at 100% of their potential value
		velMult = sum / (ampUpper - ampLower);
		velMult = Math.pow(velMult, particleExponent) * (1 - minParticleVelocity) + minParticleVelocity;
	}

	values = [];

	for (var i = 0; i < spectrumSize; i++) {
		if (begun) {
			if (i == 0) {
				var value = array[i] / 255 * height;
			}
			else if (i == spectrumSize - 1) {
				var value = (array[i - 1] + array[i]) / 2  / 255 * height;
			}
			else {
				var value = (array[i - 1] + array[i] + array[i + 1]) / 3  / 255 * height;
			}
			value = Math.min(value + 1, height);
		} else {
			value = 1;
		}
		// create linear slope at head and tail of spectrum
		if (i < headMargin) {
			//value *= Math.pow(i + 1, marginDecay) / Math.pow(headMargin, marginDecay);
			value *= headMarginSlope * Math.pow(i + 1, marginDecay) + minMarginWeight;
		} else if (spectrumSize - i <= tailMargin) {
			//value *= Math.pow(spectrumSize - i, marginDecay) / Math.pow(tailMargin, marginDecay);
			value *= tailMarginSlope * Math.pow(spectrumSize - i, marginDecay) + minMarginWeight;
		}
		
		var exponent = (1 - (i / spectrumSize)) * (maxSpectrumExponent - minSpectrumExponent) + minSpectrumExponent
		values[i] = Math.max(Math.pow(value / height, exponent) * height, 1);
		values[i] *= (2 - values[i] / height);
	}

	// drawing pass
	for (var i = 0; i < spectrumSize; i++) {
		var value = values[i];
		ctx.fillRect(i * (barWidth + barMargin), height - value, barWidth, value, value);
	}
};
